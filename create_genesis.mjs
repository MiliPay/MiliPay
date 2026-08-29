import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createGenesisAdmin() {
  const email = "sampleadmin@milipay.com";
  const fullName = "Alas Admin";
  const phone = "09079694880";
  const nin = "12327586323"; // Trimmed to 11 digits
  const tempPassword = "Password12$";
  
  console.log("Creating Genesis Super Admin in Auth...");
  
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      nin_last_4: nin.slice(-4),
      must_change_password: true,
    },
    app_metadata: {
      role: 'super_admin',
    }
  });

  if (authError) {
    console.error("Auth Error:", authError);
    return;
  }

  const userId = authData.user.id;
  console.log(`Auth user created successfully! ID: ${userId}`);

  console.log("Creating staff profile...");
  const { error: profileError } = await supabase
    .from('staff_profiles')
    .insert({
      id: userId,
      full_name: fullName,
      email: email,
      phone: phone,
      nin: nin,
      nin_last_4: nin.slice(-4),
      role: 'super_admin',
      status: 'active'
    });

  if (profileError) {
    console.error("Profile Error:", profileError);
  } else {
    console.log("Genesis Super Admin successfully created in staff_profiles!");
  }
}

createGenesisAdmin();
