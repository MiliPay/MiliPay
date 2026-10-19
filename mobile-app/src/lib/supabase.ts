import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Which Supabase project a build talks to comes from its EAS profile
// (eas.json: development -> milipay-development, preview -> milipay-staging).
// Unset falls back to the original project, which production still uses.
// The anon key is public by design; RLS is what protects the data.
// process.env.EXPO_PUBLIC_* must be read directly so Expo inlines it.
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://hkhnduxbxfcqjgrdnqcz.supabase.co';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhraG5kdXhieGZjcWpncmRucWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxODQ1MjcsImV4cCI6MjA5OTc2MDUyN30.gJCC-ncThy7qXNzj3e3AfSC6CcQ-cHu3LIPRlSmHpZw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
