import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load from AdminPanel env
dotenv.config({ path: path.resolve(__dirname, '../../AdminPanel/.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Logging in as admin...");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'abdulhakeemhabeebullah9@gmail.com',
    password: 'Password12$'
  });

  if (error) {
    console.error("Login failed:", error.message);
    return;
  }

  console.log("Logged in! Session token:", data.session.access_token.substring(0, 20) + "...");

  console.log("Invoking create-staff...");
  const { data: resData, error: funcError } = await supabase.functions.invoke('create-staff', {
    body: {
      fullName: 'Test Agent from Script',
      email: `test_agent_${Date.now()}@example.com`,
      phone: '08012345678',
      role: 'agent',
      state: 'Lagos'
    }
  });

  if (funcError) {
    console.error("Edge function failed:", funcError.message);
    console.error("Edge function full error:", funcError);
  } else {
    console.log("Success! Data:", resData);
  }
}

run();
