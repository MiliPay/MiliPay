import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// In a real app, you would use env vars, but we can safely hardcode the ANON key for the mobile client.
const supabaseUrl = 'https://hkhnduxbxfcqjgrdnqcz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhraG5kdXhieGZjcWpncmRucWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxODQ1MjcsImV4cCI6MjA5OTc2MDUyN30.gJCC-ncThy7qXNzj3e3AfSC6CcQ-cHu3LIPRlSmHpZw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
