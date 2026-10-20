import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Which Supabase project a build talks to comes from its EAS profile
// (eas.json: development -> milipay-development; preview and production ->
// milipay-staging until the production database exists).
// Unset (a local `expo start`) falls back to development; deployed builds
// always set it (preview and production -> staging, see docs/HANDOFF.md).
// The anon key is public by design; RLS is what protects the data.
// process.env.EXPO_PUBLIC_* must be read directly so Expo inlines it.
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://govynvmsdaeoxpktgjpn.supabase.co';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdvdnludm1zZGFlb3hwa3RnanBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MDA0NjUsImV4cCI6MjEwNzk3NjQ2NX0.mklL0mmD1bUT8Obp2QakF4SuFPx8izw19ncCsdNiszE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
