import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function wipeDatabase() {
  console.log("Starting full database wipe...");

  // 1. Wipe Public Tables (in order of foreign key constraints)
  console.log("Wiping ticket_messages...");
  await supabase.from('ticket_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  
  console.log("Wiping support_tickets...");
  await supabase.from('support_tickets').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  console.log("Wiping customers...");
  await supabase.from('customers').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  console.log("Wiping staff_profiles...");
  await supabase.from('staff_profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // 2. Wipe Auth Users
  console.log("Fetching all Auth users...");
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error("Error listing users:", listError);
  } else if (usersData && usersData.users) {
    console.log(`Found ${usersData.users.length} Auth users to delete.`);
    for (const user of usersData.users) {
      const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
      if (deleteError) {
         console.error(`Error deleting user ${user.email}:`, deleteError);
      } else {
         console.log(`Deleted Auth user: ${user.email}`);
      }
    }
  }

  console.log("Wipe complete! The database and Auth are now completely empty.");
}

wipeDatabase();
