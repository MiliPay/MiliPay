/**
 * Stand-in for https://esm.sh/@supabase/supabase-js under Node.
 *
 * createClient() returns whichever in-memory database the current test
 * installed, so the Edge Function's queries run against rows the test can
 * set up and then inspect.
 */
import type { FakeSupabase } from "./fake-supabase";

export type SupabaseClient = FakeSupabase;

export function createClient(): FakeSupabase {
  const db = (globalThis as { __fakeSupabase?: FakeSupabase }).__fakeSupabase;
  if (!db) throw new Error("test did not install a fake database");
  return db;
}
