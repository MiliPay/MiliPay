import { supabase } from "@milipay/shared/lib/supabase";
import type { DashboardData, DashboardRange } from "./view";

/** Everything on the admin Dashboard, in one read (public.admin_dashboard). */
export async function fetchAdminDashboard(range: DashboardRange): Promise<DashboardData> {
  const { data, error } = await supabase.rpc("admin_dashboard", { p_range: range });
  if (error) throw new Error(error.message);
  return data as DashboardData;
}
