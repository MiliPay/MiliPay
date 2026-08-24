import { createClient } from "@supabase/supabase-js";

const DEFAULT_URL = "https://hkhnduxbxfcqjgrdnqcz.supabase.co";
const DEFAULT_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhraG5kdXhieGZjcWpncmRucWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxODQ1MjcsImV4cCI6MjA5OTc2MDUyN30.gJCC-ncThy7qXNzj3e3AfSC6CcQ-cHu3LIPRlSmHpZw";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn("Using default Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
