import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://hkhnduxbxfcqjgrdnqcz.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhraG5kdXhieGZjcWpncmRucWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxODQ1MjcsImV4cCI6MjA5OTc2MDUyN30.gJCC-ncThy7qXNzj3e3AfSC6CcQ-cHu3LIPRlSmHpZw";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'abdulhakeemhabeebullah9@gmail.com',
    password: 'Password12$'
  });
  if (authError) {
    console.error("Auth failed", authError);
    return;
  }
  
  console.log("Logged in");

  const mockCustomers = Array.from({ length: 20 }).map((_, i) => {
    return {
      first_name: `Customer`,
      last_name: `${i + 1}`,
      phone: `0801234567${i % 10}`,
      email: `customer${i}@example.com`,
      nin_last_4: `${1000 + i}`,
      state: i % 2 === 0 ? 'Lagos' : 'Abuja',
      status: i % 3 === 0 ? 'pending' : 'active',
      captured_fingers: ["thumb", "index", "middle", "ring"]
    };
  });

  const { data, error } = await supabase.from('customers').insert(mockCustomers).select();
  if (error) {
    console.error("Insert error:", error);
  } else {
    console.log("Inserted mock customers:", data?.length);
  }
}

run();
