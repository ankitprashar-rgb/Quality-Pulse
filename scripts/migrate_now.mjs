/**
 * Self-contained migration script.
 * Uses built-in Node.js modules only — NO npm install needed.
 * Fetches data from Google Sheets using service account, uploads to Supabase.
 */
import { readFileSync } from 'fs';
import { createSign } from 'crypto';
import { request } from 'https';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ───
const CREDS_PATH = resolve(__dirname, '../../google-credentials.json');
const SPREADSHEET_ID = '1PDWBktsa6WDa-waadkviayR7wEVPiTN3S9SogROlXU8';
const SHEET_NAME = 'Rejection Log';
const SUPABASE_URL = 'trgvsjirzofgkheaqzne.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyZ3Zzamlyem9mZ2toZWFxem5lIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTk2NDg2NiwiZXhwIjoyMDg1NTQwODY2fQ.bL-PRB5rDoVFK8MdSlyQn35pFE3XnPfm2IA_0Wa9eak';

// ─── Helper: HTTPS request as promise ───
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── Step 1: Create JWT for Google API ───
function createJWT(creds) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(creds.private_key, 'base64url');
  return `${header}.${payload}.${signature}`;
}

// ─── Step 2: Get access token ───
async function getAccessToken(creds) {
  const jwt = createJWT(creds);
  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  const res = await httpsRequest({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
  }, body);
  const parsed = JSON.parse(res.data);
  if (!parsed.access_token) throw new Error('Failed to get token: ' + res.data);
  return parsed.access_token;
}

// ─── Step 3: Fetch sheet data ───
async function fetchSheetData(token) {
  const range = encodeURIComponent(`${SHEET_NAME}!A:AB`);
  const res = await httpsRequest({
    hostname: 'sheets.googleapis.com',
    path: `/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.status !== 200) throw new Error('Sheets API error: ' + res.data);
  return JSON.parse(res.data).values;
}

// ─── Step 4: Transform data ───
function transformData(rows) {
  const headers = rows[0];
  const colIndex = (name) => headers.indexOf(name);

  return rows.slice(1).map(row => {
    const get = (name) => (row[colIndex(name)] || '').trim();
    const num = (name) => {
      const v = get(name).replace(/[%,\s]/g, '');
      return parseFloat(v) || 0;
    };

    const date = get('Date') || get('Timestamp');
    if (!date) return null;

    return {
      date,
      client_name: get('Client Name'),
      vertical: get('Vertical'),
      project_name: get('Project Name'),
      product: get('Product / Panel'),
      print_media: get('Print Media'),
      lamination: get('Lamination Media'),
      printer_model: get('Printer Model'),
      size: get('Size'),
      master_qty: num('Master Qty'),
      batch_qty: num('Batch Qty'),
      design_rej: num('Design File Rejection'),
      print_rej: num('Printing Rejection'),
      lam_rej: num('Lamination Rejection'),
      cut_rej: num('Cut Rejection'),
      pack_rej: num('Packaging Rejection'),
      media_rej: num('Media Rejection'),
      qty_rejected: num('Qty Rejected'),
      qty_delivered: num('Qty Delivered'),
      rejection_percent: num('Rejection %'),
      in_stock: num('In Stock'),
      reason: get('Rejection Reason'),
    };
  }).filter(Boolean);
}

// ─── Step 5: Truncate existing data ───
async function truncateTable() {
  const res = await httpsRequest({
    hostname: SUPABASE_URL,
    path: '/rest/v1/rpc/truncate_rejection_log',
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    }
  }, '{}');
  // If the RPC doesn't exist, we'll just delete all rows instead
  if (res.status >= 400) {
    console.log('  RPC not available, using DELETE instead...');
    const delRes = await httpsRequest({
      hostname: SUPABASE_URL,
      path: '/rest/v1/rejection_log?id=gt.0',
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      }
    });
    if (delRes.status >= 400) console.log('  Delete status:', delRes.status, '(table may already be empty)');
  }
}

// ─── Step 6: Upload to Supabase ───
async function uploadToSupabase(records) {
  const BATCH = 50;
  let uploaded = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const body = JSON.stringify(batch);
    const res = await httpsRequest({
      hostname: SUPABASE_URL,
      path: '/rest/v1/rejection_log',
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Prefer': 'return=minimal',
      }
    }, body);
    if (res.status >= 400) {
      console.error(`  ❌ Batch ${i / BATCH + 1} failed (${res.status}): ${res.data.substring(0, 200)}`);
    } else {
      uploaded += batch.length;
      console.log(`  ✅ Batch ${i / BATCH + 1}: ${batch.length} rows uploaded (total: ${uploaded})`);
    }
  }
  return uploaded;
}

// ─── Main ───
async function main() {
  console.log('🚀 Quality Pulse Data Migration\n');

  console.log('1️⃣  Reading service account credentials...');
  const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf8'));

  console.log('2️⃣  Getting Google API access token...');
  const token = await getAccessToken(creds);
  console.log('  ✅ Token acquired\n');

  console.log('3️⃣  Fetching data from Google Sheets...');
  const rows = await fetchSheetData(token);
  console.log(`  ✅ Fetched ${rows.length - 1} data rows\n`);

  console.log('4️⃣  Transforming data...');
  const records = transformData(rows);
  console.log(`  ✅ ${records.length} valid records ready\n`);

  console.log('5️⃣  Clearing existing data in Supabase...');
  await truncateTable();
  console.log('  ✅ Table cleared\n');

  console.log('6️⃣  Uploading to Supabase...');
  const uploaded = await uploadToSupabase(records);

  console.log(`\n🎉 Migration complete! ${uploaded} records uploaded to Supabase.`);
}

main().catch(e => {
  console.error('❌ Fatal error:', e.message);
  process.exit(1);
});
