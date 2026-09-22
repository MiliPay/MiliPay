import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Fingerprint,
  RefreshCw,
  Wallet,
} from "lucide-react";

import { supabase } from "../../lib/supabase";
import { formatNaira } from "../../lib/utils/format";

/**
 * Quick-services operations.
 *
 * This page exists because the sweep deliberately refuses to guess. When a
 * purchase cannot be resolved automatically — BigiSub never answered, a refund
 * keeps failing, a webhook disagreed with the price we charged — the money is
 * sitting with us and somebody has to decide. Without somewhere to see that,
 * the queues fill silently and the first anyone hears is a complaint.
 *
 * Palm matching shares the page rather than growing its own, because the
 * question an operator actually asks in the morning is "is anything wrong",
 * not "is anything wrong with subsystem four".
 */

interface Snapshot {
  since: string;
  generatedAt: string;
  window: {
    total: number;
    delivered: number;
    failed: number;
    refunded: number;
    inFlight: number;
    value: number;
    margin: number;
  };
  queues: {
    pending: number;
    pendingUnresolvable: number;
    refundsOpen: number;
    refundsFailed: number;
    quarantined: number;
    stuck: number;
  };
  byService: {
    service_type: string;
    provider: string;
    total: number;
    delivered: number;
    failed: number;
  }[];
  attention: {
    reference: string;
    status: string;
    amount: number;
    service_type: string | null;
    provider: string | null;
    operator_transaction_id: string | null;
    failure_reason: string | null;
    updated_at: string;
  }[];
  palm: {
    events: number;
    matched: number;
    ambiguous: number;
    rejected: number;
    avgMargin: number | null;
    minMargin: number | null;
    gallerySize: number | null;
  };
  enrolment: { customers: number; withTemplate: number; simulated: number };
}

function Tile({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "bad"
      ? "text-status-fail"
      : tone === "warn"
        ? "text-status-warn"
        : tone === "good"
          ? "text-status-ok"
          : "text-ink";

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 text-ink-muted text-xs uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-ink-muted">{hint}</div> : null}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  quarantined: "bg-status-warn/15 text-status-warn",
  refund_failed: "bg-status-fail/15 text-status-fail",
  fulfilment_pending: "bg-status-info/15 text-status-info",
  refund_pending: "bg-signal/15 text-signal",
  initiated: "bg-white/10 text-ink-muted",
  paid: "bg-white/10 text-ink-muted",
  fulfilling: "bg-white/10 text-ink-muted",
};

export function OperationsPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("vtu_operations_snapshot", {
      p_hours: hours,
    });
    if (rpcError) {
      setError(rpcError.message);
    } else {
      setSnapshot(data as Snapshot);
    }
    setLoading(false);
  }, [hours]);

  useEffect(() => {
    void load();
    // Polled rather than subscribed: these are aggregates over the whole
    // estate, so there is no single row to watch, and a minute of staleness on
    // a counter is not worth a live query per change.
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const resolve = async (reference: string, action: "mark_delivered" | "refund") => {
    const note = window.prompt(
      action === "refund"
        ? `Refund ${reference}. Why? (recorded against your name)`
        : `Mark ${reference} delivered. What confirms it? (recorded against your name)`,
    );
    if (note === null) return;

    setBusy(reference);
    const { error: rpcError } = await supabase.rpc("admin_resolve_transaction", {
      p_reference: reference,
      p_action: action,
      p_note: note || null,
    });
    setBusy(null);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await load();
  };

  if (loading) {
    return <div className="p-8 text-ink-muted">Loading operations…</div>;
  }

  if (error && !snapshot) {
    return <div className="p-8 text-status-fail">Could not load operations: {error}</div>;
  }
  if (!snapshot) return null;

  const { window: w, queues, palm, enrolment } = snapshot;
  const successRate = w.total > 0 ? Math.round((w.delivered / w.total) * 100) : null;

  // Everything here means a person has to act. Zero is the only good number.
  const needsAttention =
    queues.quarantined + queues.refundsFailed + queues.stuck + queues.pendingUnresolvable;

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Operations</h1>
          <p className="text-sm text-ink-muted mt-1">
            Quick services and biometric matching. Updated{" "}
            {new Date(snapshot.generatedAt).toLocaleTimeString("en-NG")}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-ink"
          >
            <option value={1}>Last hour</option>
            <option value={24}>Last 24 hours</option>
            <option value={168}>Last 7 days</option>
            <option value={720}>Last 30 days</option>
          </select>
          <button
            onClick={() => void load()}
            className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-ink hover:bg-white/10"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {needsAttention > 0 ? (
        <div className="rounded-2xl border border-status-warn/30 bg-status-warn/[0.06] p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-status-warn mt-0.5 shrink-0" />
          <div>
            <div className="text-ink font-medium">
              {needsAttention} transaction{needsAttention === 1 ? "" : "s"} need a decision
            </div>
            <div className="text-sm text-ink-muted mt-1">
              These are the ones the sweep will not resolve on its own. Each one is a
              customer whose money is with us.
            </div>
          </div>
        </div>
      ) : null}

      <section>
        <h2 className="text-sm uppercase tracking-wider text-ink-muted mb-3">Volume</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Tile label="Delivered" value={w.delivered} hint={`of ${w.total} started`} tone="good" icon={<CheckCircle2 className="w-3.5 h-3.5" />} />
          <Tile
            label="Success rate"
            value={successRate === null ? "—" : `${successRate}%`}
            hint={successRate !== null && successRate < 90 ? "below 90% — check providers" : undefined}
            tone={successRate !== null && successRate < 90 ? "warn" : "neutral"}
          />
          <Tile label="Value delivered" value={formatNaira(w.value)} hint={`margin ${formatNaira(w.margin)}`} />
          <Tile label="In flight" value={w.inFlight} hint="money taken, not yet delivered" tone={w.inFlight > 0 ? "warn" : "neutral"} icon={<Clock className="w-3.5 h-3.5" />} />
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-ink-muted mb-3">Queues</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <Tile label="Pending" value={queues.pending} hint="awaiting the operator" tone={queues.pending > 0 ? "warn" : "neutral"} />
          <Tile
            label="Unresolvable"
            value={queues.pendingUnresolvable}
            // No BigiSub transaction id means requery has nothing to ask
            // about. These only move when a person looks them up.
            hint="no operator id — resolve by hand"
            tone={queues.pendingUnresolvable > 0 ? "bad" : "neutral"}
          />
          <Tile label="Refunds open" value={queues.refundsOpen} tone={queues.refundsOpen > 0 ? "warn" : "neutral"} />
          <Tile label="Refunds failed" value={queues.refundsFailed} hint="retries exhausted" tone={queues.refundsFailed > 0 ? "bad" : "neutral"} />
          <Tile label="Quarantined" value={queues.quarantined} hint="amount disagreed" tone={queues.quarantined > 0 ? "bad" : "neutral"} />
          <Tile label="Stuck > 1h" value={queues.stuck} tone={queues.stuck > 0 ? "bad" : "neutral"} />
        </div>
      </section>

      {snapshot.attention.length > 0 ? (
        <section>
          <h2 className="text-sm uppercase tracking-wider text-ink-muted mb-3">
            Needs a decision
          </h2>
          <div className="rounded-2xl border border-white/8 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-ink-muted">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Reference</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-left font-medium px-4 py-3">Service</th>
                  <th className="text-right font-medium px-4 py-3">Amount</th>
                  <th className="text-left font-medium px-4 py-3">Waiting</th>
                  <th className="text-right font-medium px-4 py-3">Resolve</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.attention.map((t) => (
                  <tr key={t.reference} className="border-t border-white/5">
                    <td className="px-4 py-3 font-mono text-xs text-ink">{t.reference}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-xs ${STATUS_TONE[t.status] ?? "bg-white/10 text-ink-muted"}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {t.service_type ?? "—"} {t.provider ? `· ${t.provider}` : ""}
                      {!t.operator_transaction_id ? (
                        <span className="ml-2 text-status-fail text-xs">no operator id</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right text-ink">{formatNaira(Number(t.amount))}</td>
                    <td className="px-4 py-3 text-ink-muted text-xs">
                      {Math.round((Date.now() - new Date(t.updated_at).getTime()) / 60000)} min
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        disabled={busy === t.reference}
                        onClick={() => void resolve(t.reference, "refund")}
                        className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-ink hover:bg-white/10 disabled:opacity-40"
                      >
                        Refund
                      </button>
                      <button
                        disabled={busy === t.reference}
                        onClick={() => void resolve(t.reference, "mark_delivered")}
                        className="ml-2 text-xs px-3 py-1.5 rounded-lg bg-status-ok/15 border border-status-ok/25 text-status-ok hover:bg-status-ok/25 disabled:opacity-40"
                      >
                        Delivered
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-muted mt-2">
            Both actions are recorded against your name in the transaction's history.
            Check BigiSub's dashboard before marking anything delivered.
          </p>
        </section>
      ) : null}

      {snapshot.byService.length > 0 ? (
        <section>
          <h2 className="text-sm uppercase tracking-wider text-ink-muted mb-3">By service</h2>
          <div className="rounded-2xl border border-white/8 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-ink-muted">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Service</th>
                  <th className="text-right font-medium px-4 py-3">Total</th>
                  <th className="text-right font-medium px-4 py-3">Delivered</th>
                  <th className="text-right font-medium px-4 py-3">Failed</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.byService.map((s) => (
                  <tr key={`${s.service_type}-${s.provider}`} className="border-t border-white/5">
                    <td className="px-4 py-3 text-ink">
                      {s.service_type} · {s.provider}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-muted">{s.total}</td>
                    <td className="px-4 py-3 text-right text-status-ok">{s.delivered}</td>
                    <td className={`px-4 py-3 text-right ${s.failed > 0 ? "text-status-fail" : "text-ink-muted"}`}>
                      {s.failed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm uppercase tracking-wider text-ink-muted mb-3">
          Biometric matching
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Tile label="Scans" value={palm.events} icon={<Fingerprint className="w-3.5 h-3.5" />} />
          <Tile label="Matched" value={palm.matched} tone="good" />
          <Tile
            label="Ambiguous"
            value={palm.ambiguous}
            hint="runner-up too close — declined"
            tone={palm.ambiguous > 0 ? "warn" : "neutral"}
          />
          <Tile
            label="Smallest margin"
            value={palm.minMargin === null ? "—" : palm.minMargin.toFixed(3)}
            // The early warning. As the gallery grows the gap between best and
            // second-best shrinks; when it nears the configured margin the
            // gallery has outgrown its threshold, and that shows up here long
            // before the first customer is charged for a stranger's shopping.
            hint={
              palm.minMargin !== null && palm.minMargin < 0.1
                ? "approaching the ambiguity threshold"
                : "gap to the runner-up"
            }
            tone={palm.minMargin !== null && palm.minMargin < 0.1 ? "bad" : "neutral"}
          />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          <Tile label="Customers" value={enrolment.customers} icon={<Wallet className="w-3.5 h-3.5" />} />
          <Tile
            label="With a real template"
            value={enrolment.withTemplate}
            hint={`${enrolment.customers - enrolment.withTemplate} cannot pay by palm`}
            tone={enrolment.withTemplate < enrolment.customers ? "warn" : "good"}
          />
          <Tile
            label="Simulated enrolments"
            value={enrolment.simulated}
            hint="no real biometric on file"
            tone={enrolment.simulated > 0 ? "warn" : "neutral"}
          />
        </div>
      </section>

      {error ? <div className="text-sm text-status-fail">{error}</div> : null}
    </div>
  );
}
