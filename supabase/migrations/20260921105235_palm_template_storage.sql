-- Migration: 20260921105235_palm_template_storage.sql
-- Description:
--   customers.palm_vein_template is a single TEXT column. The HFSecurity
--   RegisterPalm call actually returns nine fields, and two of them are not
--   optional extras:
--
--     * rgb_features  - RecognizeMode defaults to kBiModal, which compares IR
--                       AND RGB. With nowhere to put the RGB vector we are
--                       permanently restricted to the weakest mode.
--     * hash_ir/rgb   - the vendor guides describe these as "used for model
--                       switching". They are how an enrolled template survives
--                       an upgrade of config/palm_models_*.bin. Without them a
--                       model upgrade means every customer re-enrols.
--
--   This adds public.palm_templates: one row per enrolled hand, carrying
--   everything the SDK produces plus the provenance needed to match safely
--   (which recognition mode produced it, which algorithm version, whether the
--   capture was simulated).
--
--   The old column is left in place and untouched. Nothing reads from this
--   table yet; the cutover happens when hardware arrives.
--
--   Storage format for the three vector columns is BYTEA holding a packed
--   little-endian float32 array, which is exact and platform-neutral. The
--   desktop SDK hands us std::vector<float> and Android hands us byte[]; we
--   normalise to the same bytes so a palm enrolled in Lagos on a Windows kit
--   matches on an Android terminal in Sokoto. feature_dim records the length
--   so the first real capture tells us the dimension the vendor would not.
--
--   The approximate-nearest-neighbour index for 1:N lives in the matcher
--   service behind PALM_MATCH_URL, not here. Postgres is durable storage;
--   pgvector at national scale is the wrong tool and would put raw biometrics
--   in the same blast radius as the application database.

-- ── Table ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.palm_templates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,

  -- Raw SDK value. The vendor's own headers document 0/1 as left/right in
  -- three places and right/left in a fourth, so this is deliberately NOT
  -- named or interpreted. Store it, compare like for like, label it only
  -- once it has been confirmed against hardware.
  palm_type          SMALLINT NOT NULL CHECK (palm_type IN (0, 1)),

  ir_features        BYTEA,
  rgb_features       BYTEA,
  skeleton           BYTEA,

  hash_ir            TEXT,
  hash_rgb           TEXT,

  recog_mode         TEXT NOT NULL
                       CHECK (recog_mode IN ('kRegIrVSIr', 'kRegIrVSRgb',
                                             'kRegRgbVSIr', 'kRegRgbVSRgb',
                                             'kBiModal')),
  algorithm_version  TEXT NOT NULL,
  feature_dim        INTEGER CHECK (feature_dim IS NULL OR feature_dim > 0),

  -- RegisterPalm's own quality score, kept so a rising false-reject rate can
  -- be traced back to a marginal enrolment instead of blamed on the matcher.
  quality_score      NUMERIC(6, 4),

  -- PalmDetectResult. Only a clean registration is storable; see the
  -- constraint below.
  capture_result     SMALLINT NOT NULL DEFAULT 0,

  simulated          BOOLEAN NOT NULL DEFAULT FALSE,

  enrolled_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enrolled_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Retirement rather than deletion: a template that is replaced stays on
  -- file, because "which template authorised this payment" must remain
  -- answerable after the customer re-enrols.
  retired_at         TIMESTAMPTZ,
  retired_reason     TEXT,

  has_ir_features    BOOLEAN GENERATED ALWAYS AS (ir_features IS NOT NULL) STORED,
  has_rgb_features   BOOLEAN GENERATED ALWAYS AS (rgb_features IS NOT NULL) STORED,

  -- kBiModal compares both modalities, so enrolling in that mode without an
  -- RGB vector would produce a template that can never match.
  CONSTRAINT palm_templates_bimodal_needs_rgb
    CHECK (recog_mode <> 'kBiModal' OR rgb_features IS NOT NULL),

  -- An active template must have come from a successful capture.
  CONSTRAINT palm_templates_active_capture_succeeded
    CHECK (retired_at IS NOT NULL OR capture_result = 0),

  -- Every mode except kRegRgbVSRgb reads the IR vector.
  CONSTRAINT palm_templates_needs_some_feature
    CHECK (ir_features IS NOT NULL OR rgb_features IS NOT NULL)
);

COMMENT ON TABLE public.palm_templates IS
  'Palm-vein templates from HFSecurity RegisterPalm. Feature columns are packed little-endian float32. Readable only by service_role.';

COMMENT ON COLUMN public.palm_templates.palm_type IS
  'Raw SDK palm_type. Vendor headers contradict each other on whether 0 is left or right - do not interpret.';

COMMENT ON COLUMN public.palm_templates.hash_ir IS
  'RegisterPalm hash_ir_output. Vendor documents these as used for model switching.';

-- One live template per hand per customer. Retired rows are unconstrained so
-- history accumulates.
CREATE UNIQUE INDEX IF NOT EXISTS palm_templates_one_active_per_hand
  ON public.palm_templates (customer_id, palm_type)
  WHERE retired_at IS NULL;

CREATE INDEX IF NOT EXISTS palm_templates_customer_idx
  ON public.palm_templates (customer_id);

-- The matcher pages the live gallery on start-up to build its ANN index.
CREATE INDEX IF NOT EXISTS palm_templates_gallery_idx
  ON public.palm_templates (enrolled_at, id)
  WHERE retired_at IS NULL AND simulated = FALSE;

-- ── Access ───────────────────────────────────────────────────────────────
-- Raw biometric vectors are readable by service_role alone. Staff get the
-- metadata they need to answer "is this customer enrolled, and how well",
-- and nothing that could be replayed.

ALTER TABLE public.palm_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.palm_templates FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.palm_templates FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id, customer_id, palm_type, recog_mode, algorithm_version, feature_dim,
  quality_score, capture_result, simulated, enrolled_at, enrolled_by,
  retired_at, retired_reason, has_ir_features, has_rgb_features
) ON public.palm_templates TO authenticated;

GRANT ALL ON public.palm_templates TO service_role;

DROP POLICY IF EXISTS "Staff can view palm template metadata" ON public.palm_templates;
CREATE POLICY "Staff can view palm template metadata"
  ON public.palm_templates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = auth.uid()
        AND sp.role IN ('agent', 'support', 'admin', 'super_admin')
        AND COALESCE(sp.status, '') = 'active'
    )
  );

DROP POLICY IF EXISTS "Customers can see their own enrolment" ON public.palm_templates;
CREATE POLICY "Customers can see their own enrolment"
  ON public.palm_templates FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT c.id FROM public.customers c WHERE c.auth_user_id = auth.uid()
    )
  );

-- ── Match audit ──────────────────────────────────────────────────────────
-- 1:N cannot be operated blind. The false-accept rate of a 1:N search scales
-- with the size of the gallery, so the score distribution has to be watched
-- as the customer base grows - specifically the margin between the best and
-- second-best candidate, which is the signal that a gallery has outgrown its
-- threshold. No features are recorded here, only the arithmetic.

CREATE TABLE IF NOT EXISTS public.palm_match_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  merchant_id         UUID,
  terminal_id         UUID,
  mode                TEXT NOT NULL CHECK (mode IN ('1:1', '1:N')),
  gallery_size        INTEGER,
  candidates_compared INTEGER,
  top_score           NUMERIC(6, 4),
  -- The gap to the runner-up. A shrinking margin across the estate is the
  -- early warning that the gallery has grown past what the threshold can
  -- separate, and it shows up long before the first wrong customer is billed.
  runner_up_score     NUMERIC(6, 4),
  threshold           NUMERIC(6, 4),
  decision            TEXT NOT NULL CHECK (decision IN ('matched', 'rejected', 'ambiguous', 'error')),
  latency_ms          INTEGER,
  algorithm_version   TEXT,
  error_code          TEXT
);

CREATE INDEX IF NOT EXISTS palm_match_events_occurred_idx
  ON public.palm_match_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS palm_match_events_decision_idx
  ON public.palm_match_events (decision, occurred_at DESC);

ALTER TABLE public.palm_match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.palm_match_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.palm_match_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.palm_match_events TO authenticated;
GRANT ALL ON public.palm_match_events TO service_role;

DROP POLICY IF EXISTS "Admins can review match events" ON public.palm_match_events;
CREATE POLICY "Admins can review match events"
  ON public.palm_match_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = auth.uid()
        AND sp.role IN ('admin', 'super_admin')
        AND COALESCE(sp.status, '') = 'active'
    )
  );

-- ── Enrolment state, without exposing templates ──────────────────────────

-- SECURITY DEFINER bypasses the policies above, so the authorisation they
-- express has to be restated here. Without this any authenticated user could
-- ask whether any customer is enrolled.
CREATE OR REPLACE FUNCTION public.palm_enrolment_state(p_customer_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_result JSON;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = v_uid
        AND sp.role IN ('agent', 'support', 'admin', 'super_admin')
        AND COALESCE(sp.status, '') = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = p_customer_id AND c.auth_user_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(
    json_agg(
      json_build_object(
        'palmType', t.palm_type,
        'recogMode', t.recog_mode,
        'algorithmVersion', t.algorithm_version,
        'qualityScore', t.quality_score,
        'simulated', t.simulated,
        'hasIr', t.has_ir_features,
        'hasRgb', t.has_rgb_features,
        'enrolledAt', t.enrolled_at
      ) ORDER BY t.palm_type
    ),
    '[]'::json
  )
  INTO v_result
  FROM public.palm_templates t
  WHERE t.customer_id = p_customer_id
    AND t.retired_at IS NULL;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.palm_enrolment_state(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.palm_enrolment_state(UUID) TO authenticated, service_role;
