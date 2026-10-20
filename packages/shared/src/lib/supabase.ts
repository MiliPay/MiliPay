import { createClient } from "@supabase/supabase-js";

export const DEFAULT_URL = "https://govynvmsdaeoxpktgjpn.supabase.co";
export const DEFAULT_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdvdnludm1zZGFlb3hwa3RnanBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MDA0NjUsImV4cCI6MjEwNzk3NjQ2NX0.mklL0mmD1bUT8Obp2QakF4SuFPx8izw19ncCsdNiszE";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn("Using default Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
