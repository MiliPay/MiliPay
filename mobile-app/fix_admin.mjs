import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixAdminProfile() {
  const adminId = '0f248ca6-f58f-417b-bd71-e1f28d2ea458';
  
  // Get the admin's email from Auth
  const { data: { user }, error: authError } = await supabase.auth.admin.getUserById(adminId);
  if (authError) {
    console.error('Error fetching auth user:', authError);
    return;
  }

  console.log(`Found Auth User: ${user.email}`);

  // Insert into staff_profiles
  const { error: insertError } = await supabase
    .from('staff_profiles')
    .upsert({
      id: adminId,
      full_name: user.user_metadata?.full_name || 'Admin Restored',
      email: user.email,
      phone: user.phone || '00000000000',
      role: 'super_admin',
      status: 'active',
      nin: '11111111111',
      nin_last_4: '1111'
    });

  if (insertError) {
    console.error('Error fixing staff_profiles:', insertError);
  } else {
    console.log('Successfully restored Admin profile in the database!');
  }
}

fixAdminProfile();
