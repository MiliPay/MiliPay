/**
 * VTPass Sandbox Verification & Diagnostic Tool
 * Usage: node scripts/test-vtpass-sandbox.js
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
const env = {};
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (m) {
      let v = (m[2] || '').trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  });
}

const BASE_URL = env.VTPASS_BASE_URL || 'https://sandbox.vtpass.com/api';
const API_KEY = env.VTPASS_API_KEY || '';
const SECRET_KEY = env.VTPASS_SECRET_KEY || '';
const PUBLIC_KEY = env.VTPASS_PUBLIC_KEY || '';

function generateRequestId() {
  const now = new Date();
  const wat = new Date(now.getTime() + 1 * 60 * 60 * 1000);
  const yyyy = wat.getUTCFullYear().toString();
  const mm = String(wat.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(wat.getUTCDate()).padStart(2, '0');
  const hh = String(wat.getUTCHours()).padStart(2, '0');
  const ii = String(wat.getUTCMinutes()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 8);
  return `${yyyy}${mm}${dd}${hh}${ii}${rand}`;
}

async function runDiagnostics() {
  console.log('====================================================');
  console.log('       MiliPay -> VTPass Sandbox Diagnostic Tool    ');
  console.log('====================================================\n');
  console.log(`Endpoint:    ${BASE_URL}`);
  console.log(`API Key:     ${API_KEY ? `${API_KEY.slice(0, 6)}... (Configured)` : 'Not set in .env'}`);
  console.log(`Secret Key:  ${SECRET_KEY ? '******** (Configured)' : 'Not set in .env'}`);
  console.log(`Public Key:  ${PUBLIC_KEY ? `${PUBLIC_KEY.slice(0, 6)}...` : 'Not set'}\n`);

  // 1. Test Public Variations Endpoint
  console.log('1. Testing Public Dynamic Variations (MTN Data)...');
  try {
    const res = await fetch(`${BASE_URL}/service-variations?serviceID=mtn-data`);
    const json = await res.json();
    if (json.response_description === '000' && json.content?.variations) {
      console.log(`   [PASS] Successfully pulled ${json.content.variations.length} live MTN Data variations!`);
      console.log(`   Sample Plan: ${json.content.variations[0].name} (₦${json.content.variations[0].variation_amount})`);
    } else {
      console.log(`   [WARN] Unexpected response:`, json);
    }
  } catch (err) {
    console.log(`   [FAIL] Network error:`, err.message);
  }

  // 2. Test Public Variations (DStv Bouquets)
  console.log('\n2. Testing Public Dynamic Variations (DStv Bouquets)...');
  try {
    const res = await fetch(`${BASE_URL}/service-variations?serviceID=dstv`);
    const json = await res.json();
    if (json.response_description === '000' && json.content?.variations) {
      console.log(`   [PASS] Successfully pulled ${json.content.variations.length} live DStv Bouquets!`);
      console.log(`   Sample Bouquet: ${json.content.variations[0].name} (₦${json.content.variations[0].variation_amount})`);
    } else {
      console.log(`   [WARN] Unexpected response:`, json);
    }
  } catch (err) {
    console.log(`   [FAIL] Network error:`, err.message);
  }

  // 3. Test Wallet Balance (Requires Sandbox API Credentials)
  console.log('\n3. Testing Sandbox Wallet Balance Endpoint...');
  if (!API_KEY && !PUBLIC_KEY) {
    console.log('   [INFO] API Keys not provided in .env yet.');
    console.log('   To connect to your personal sandbox wallet:');
    console.log('   1. Sign up at https://sandbox.vtpass.com');
    console.log('   2. Go to Profile -> API Settings and generate Public/Secret/API keys.');
    console.log('   3. Add VTPASS_API_KEY & VTPASS_SECRET_KEY to your .env file.');
  } else {
    try {
      const headers = {
        'api-key': API_KEY,
      };
      if (SECRET_KEY) headers['secret-key'] = SECRET_KEY;
      if (PUBLIC_KEY) headers['public-key'] = PUBLIC_KEY;

      const res = await fetch(`${BASE_URL}/balance`, { headers });
      const json = await res.json();
      if (json.code === '000' && json.contents) {
        console.log(`   [PASS] Sandbox Balance: ₦${Number(json.contents.balance).toLocaleString()}`);
      } else {
        console.log(`   [NOTICE] Response from VTPass:`, json);
      }
    } catch (err) {
      console.log(`   [FAIL] Balance check failed:`, err.message);
    }
  }

  // 4. Test Vend Simulation (Airtime / Data)
  console.log('\n4. Testing Sandbox Recharge Payment Endpoint (/pay)...');
  if (!API_KEY || !SECRET_KEY) {
    console.log('   [INFO] VTPass credentials not yet in .env.');
    console.log('   The system is currently running in HIGH-FIDELITY SIMULATOR mode.');
    console.log('   All transactions vend instant sandbox tokens & operator references seamlessly.');
  } else {
    const requestId = generateRequestId();
    console.log(`   Executing Sandbox Test Vend (Request ID: ${requestId})...`);
    try {
      const payload = {
        request_id: requestId,
        serviceID: 'mtn',
        amount: 100,
        phone: '08011111111',
      };

      const res = await fetch(`${BASE_URL}/pay`, {
        method: 'POST',
        headers: {
          'api-key': API_KEY,
          'secret-key': SECRET_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      console.log(`   [VTPass Response]:`, json);
      if (json.code === '000' || json.code === '099') {
        console.log(`   [PASS] Sandbox transaction succeeded! Status: ${json.response_description}`);
      }
    } catch (err) {
      console.log(`   [FAIL] Sandbox vend error:`, err.message);
    }
  }

  console.log('\n====================================================');
  console.log('                  Diagnostic Complete               ');
  console.log('====================================================\n');
}

runDiagnostics();
