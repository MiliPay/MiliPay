import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const SUPABASE_URL = 'https://hkhnduxbxfcqjgrdnqcz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhraG5kdXhieGZjcWpncmRucWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxODQ1MjcsImV4cCI6MjA5OTc2MDUyN30.gJCC-ncThy7qXNzj3e3AfSC6CcQ-cHu3LIPRlSmHpZw';

// We use the logged-in user's session, so we need their access token.
// This script should be run from the browser console or via a page.
// For simplicity, we'll create a standalone Node script using the service role approach.

const NIGERIAN_STATES = [
  'Lagos', 'Kano', 'Rivers', 'Oyo', 'Kaduna', 'Anambra', 'Enugu',
  'Abuja', 'Ogun', 'Delta', 'Edo', 'Osun', 'Kwara', 'Borno',
  'Plateau', 'Imo', 'Abia', 'Akwa Ibom', 'Bauchi', 'Ekiti',
  'Cross River', 'Niger', 'Kogi', 'Nassarawa', 'Ondo', 'Benue',
  'Adamawa', 'Taraba', 'Sokoto', 'Zamfara', 'Kebbi', 'Gombe',
  'Yobe', 'Jigawa', 'Bayelsa', 'Ebonyi'
];

const NIGERIAN_FIRST_NAMES = [
  'Adewale', 'Chidinma', 'Musa', 'Fatima', 'Emeka', 'Blessing',
  'Tunde', 'Ngozi', 'Yakubu', 'Oluwaseun', 'Adamu', 'Funke',
  'Obinna', 'Hauwa', 'Segun', 'Amina', 'Chukwudi', 'Yetunde',
  'Ibrahim', 'Chiamaka', 'Danjuma', 'Aisha', 'Ikenna', 'Folake',
  'Bello', 'Chinwe', 'Sani', 'Nneka', 'Ahmed', 'Titilayo',
  'Uche', 'Zainab', 'Oladipo', 'Bukola', 'Kabiru', 'Ifeoma',
  'Garba', 'Omolara', 'Chinedu', 'Halima', 'Kunle', 'Mercy',
  'Abdullahi', 'Grace', 'Femi', 'Patience', 'Yusuf', 'Joy',
  'Kola', 'Esther'
];

const NIGERIAN_LAST_NAMES = [
  'Okafor', 'Ibrahim', 'Adeleke', 'Bello', 'Ogundimu', 'Eze',
  'Bakare', 'Anya', 'Danladi', 'Effiong', 'Sule', 'Obi',
  'Adesanya', 'Okonkwo', 'Aliyu', 'Nnamdi', 'Olayinka', 'Chukwu',
  'Mohammed', 'Adeyemi', 'Usman', 'Okoro', 'Abubakar', 'Igwe',
  'Lawal', 'Nwosu', 'Yusuf', 'Ojo', 'Musa', 'Okwu',
  'Abdulrahman', 'Ogbu', 'Hassan', 'Ibe', 'Jibril', 'Agu',
  'Shehu', 'Opara', 'Dauda', 'Ezeife', 'Garba', 'Anyanwu',
  'Sani', 'Okadigbo', 'Tanko', 'Nwachukwu', 'Bala', 'Chima',
  'Idris', 'Ozoemena'
];

const MERCHANTS = [
  'Shoprite Lekki', 'Chicken Republic Ikeja', 'Total Filling Station Ajah',
  'Jumia Express Lagos', 'PEP Stores Surulere', 'SPAR Ilupeju',
  'Market Square Wuse', 'GTBank POS Awka', 'NNPC Mega Station',
  'Dangote Cement Depot', 'Bolt Rides', 'Uber Nigeria',
  'Netflix NG', 'Amazon NG', 'Konga Online', 'AirPeace Flights',
  'Dana Air', 'MTN Airtime', 'Glo Data', 'Airtel Recharge',
  'DSTV Subscription', 'PHCN Prepaid', 'Lagos Water Corp',
  'Pharmacy Direct', 'Mai Shai Corner', 'Kilimanjaro Restaurant',
  'Sweet Sensation', 'Mr Biggs', 'Dominos Pizza NG', 'Cold Stone NG'
];

const PHONE_PREFIXES = ['080', '081', '070', '090', '091'];
const STATUSES = ['active', 'active', 'active', 'active', 'active', 'active', 'active', 'pending', 'pending', 'suspended'];
const TXN_STATUSES = ['success', 'success', 'success', 'success', 'success', 'success', 'success', 'success', 'pending', 'failed'];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randPhone() { return rand(PHONE_PREFIXES) + String(randInt(10000000, 99999999)); }
function randNin4() { return String(randInt(1000, 9999)); }
function randRef() { return 'FLW-' + Date.now().toString(36).toUpperCase().slice(-4) + '-' + Math.random().toString(36).substring(2, 8).toUpperCase(); }

function randomDate(daysBack) {
  const now = new Date();
  const offset = Math.random() * daysBack * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - offset).toISOString();
}

async function seed() {
  console.log('🌱 Seeding BioPay database...\n');

  // Step 1: Fetch random user avatars/emails from randomuser.me
  let apiUsers = [];
  try {
    const res = await fetch('https://randomuser.me/api/?results=40&nat=ng');
    const json = await res.json();
    apiUsers = json.results;
    console.log(`✅ Fetched ${apiUsers.length} profiles from randomuser.me`);
  } catch (err) {
    console.log('⚠️  randomuser.me unavailable, using local data only');
  }

  // Step 2: Generate 40 customers
  const customers = [];
  const usedPhones = new Set();
  
  for (let i = 0; i < 40; i++) {
    let phone;
    do { phone = randPhone(); } while (usedPhones.has(phone));
    usedPhones.add(phone);

    const firstName = apiUsers[i]?.name?.first || rand(NIGERIAN_FIRST_NAMES);
    const lastName = apiUsers[i]?.name?.last || rand(NIGERIAN_LAST_NAMES);
    const email = apiUsers[i]?.email || (Math.random() > 0.4 ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}@gmail.com` : null);

    customers.push({
      first_name: firstName,
      last_name: lastName,
      phone,
      email,
      nin_last_4: randNin4(),
      state: rand(NIGERIAN_STATES),
      status: rand(STATUSES),
      captured_fingers: ['Left Thumb', 'Left Index', 'Right Thumb', 'Right Index'],
      created_at: randomDate(60), // spread over last 60 days
    });
  }

  console.log(`📋 Generated ${customers.length} customers`);

  // We need to sign in as the super admin to insert data (RLS requires admin role)
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error('\n❌ Please provide ADMIN_EMAIL and ADMIN_PASSWORD environment variables.');
    console.error('   Usage: ADMIN_EMAIL=your@email.com ADMIN_PASSWORD=yourpass node seed.mjs');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { transport: ws },
  });
  
  const { error: authError } = await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  if (authError) {
    console.error('❌ Login failed:', authError.message);
    process.exit(1);
  }
  console.log('🔐 Signed in as admin\n');

  // Insert customers
  const { data: insertedCustomers, error: custError } = await supabase
    .from('customers')
    .insert(customers)
    .select('id, first_name, last_name');

  if (custError) {
    console.error('❌ Customer insert failed:', custError);
    process.exit(1);
  }
  console.log(`✅ Inserted ${insertedCustomers.length} customers`);

  // Step 3: Generate 80 transactions linked to the inserted customers
  const transactions = [];
  for (let i = 0; i < 80; i++) {
    const cust = rand(insertedCustomers);
    transactions.push({
      customer_id: cust.id,
      reference: randRef() + i,
      merchant_name: rand(MERCHANTS),
      amount: randInt(50000, 50000000), // ₦500 to ₦500,000 in kobo
      status: rand(TXN_STATUSES),
      created_at: randomDate(30), // spread over last 30 days
    });
  }

  const { error: txnError } = await supabase
    .from('transactions')
    .insert(transactions);

  if (txnError) {
    console.error('❌ Transaction insert failed:', txnError);
    process.exit(1);
  }
  console.log(`✅ Inserted ${transactions.length} transactions`);

  console.log('\n🎉 Database seeded successfully! Refresh your Admin Panel.');
  process.exit(0);
}

seed();
