-- Migration: 20260827000000_palm_vein_pivot.sql
-- Description: Pivot from 4-fingerprint array to a single Palm Vein Template

ALTER TABLE public.customers DROP COLUMN IF EXISTS captured_fingers;
ALTER TABLE public.customers ADD COLUMN palm_vein_template text;
