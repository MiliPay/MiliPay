const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
(async () => {
  const { data, error } = await supabase.from('support_tickets').select('id, staff_profiles!support_tickets_assigned_to_fkey(full_name)').limit(1);
  console.log(error || data);
})();
