/**
 * Data Migration Script: Google Sheets → Supabase
 * 
 * This script migrates historical rejection log data from Google Sheets
 * to Supabase. Run this ONCE after configuring your .env credentials.
 * 
 * Usage:
 *   node scripts/migrate-data.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const GOOGLE_API_KEY = process.env.VITE_GOOGLE_API_KEY;
const BACKEND_SHEET_ID = process.env.VITE_BACKEND_SHEET_ID;

// Validate credentials
if (!SUPABASE_URL || SUPABASE_URL.includes('your-project')) {
    console.error('❌ Error: VITE_SUPABASE_URL not configured in .env');
    process.exit(1);
}

if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('your_anon_key')) {
    console.error('❌ Error: VITE_SUPABASE_ANON_KEY not configured in .env');
    process.exit(1);
}

if (!GOOGLE_API_KEY || GOOGLE_API_KEY.includes('your_google_api_key')) {
    console.error('❌ Error: VITE_GOOGLE_API_KEY not configured in .env');
    process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Fetch data from Google Sheets using the Sheets API
 */
async function fetchGoogleSheetData() {
    const sheetName = 'Rejection Log'; // Adjust if your sheet has a different name
    const range = `${sheetName}!A:Z`; // Fetch all columns

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${BACKEND_SHEET_ID}/values/${range}?key=${GOOGLE_API_KEY}`;

    console.log('📥 Fetching data from Google Sheets...');

    try {
        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google Sheets API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        return data.values || [];
    } catch (error) {
        console.error('❌ Error fetching Google Sheets data:', error.message);
        throw error;
    }
}

/**
 * Parse date string to ISO format (YYYY-MM-DD)
 */
function parseDate(dateStr) {
    if (!dateStr) return null;

    try {
        // Handle various date formats
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return null;

        return date.toISOString().split('T')[0];
    } catch (error) {
        return null;
    }
}

/**
 * Parse numeric value
 */
function parseNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
}

/**
 * Transform Google Sheets rows to Supabase format
 */
function transformData(rows) {
    if (rows.length === 0) return [];

    // First row is headers
    const headers = rows[0];
    const dataRows = rows.slice(1);

    console.log(`📊 Found ${dataRows.length} rows to migrate`);
    console.log(`📋 Headers: ${headers.join(', ')}`);

    // Map headers to column indices
    const headerMap = {};
    headers.forEach((header, index) => {
        headerMap[header.toLowerCase().trim()] = index;
    });

    // Transform each row
    const transformed = dataRows
        .filter(row => row.length > 0 && row[0]) // Skip empty rows
        .map((row, idx) => {
            try {
                return {
                    date: parseDate(row[headerMap['date']] || row[0]),
                    client_name: row[headerMap['client name'] || headerMap['client']] || '',
                    vertical: row[headerMap['vertical']] || '',
                    project_name: row[headerMap['project name'] || headerMap['project']] || '',
                    product: row[headerMap['product']] || '',
                    print_media: row[headerMap['print media'] || headerMap['media']] || '',
                    lamination: row[headerMap['lamination'] || headerMap['lam']] || '',
                    printer_model: row[headerMap['printer model'] || headerMap['printer']] || '',
                    size: row[headerMap['size']] || '',
                    master_qty: parseNumber(row[headerMap['master qty'] || headerMap['master quantity']]),
                    batch_qty: parseNumber(row[headerMap['batch qty'] || headerMap['batch quantity']]),
                    design_rej: parseNumber(row[headerMap['design rej'] || headerMap['design rejection']]),
                    print_rej: parseNumber(row[headerMap['print rej'] || headerMap['printing rejection']]),
                    lam_rej: parseNumber(row[headerMap['lam rej'] || headerMap['lamination rejection']]),
                    cut_rej: parseNumber(row[headerMap['cut rej'] || headerMap['cut rejection']]),
                    pack_rej: parseNumber(row[headerMap['pack rej'] || headerMap['packaging rejection']]),
                    media_rej: parseNumber(row[headerMap['media rej'] || headerMap['media rejection']]),
                    qty_rejected: parseNumber(row[headerMap['qty rejected'] || headerMap['total rejected']]),
                    qty_delivered: parseNumber(row[headerMap['qty delivered'] || headerMap['delivered']]),
                    rejection_percent: parseNumber(row[headerMap['rejection %'] || headerMap['rejection percent']]),
                    in_stock: parseNumber(row[headerMap['in stock'] || headerMap['stock']]),
                    reason: row[headerMap['reason'] || headerMap['top issue']] || ''
                };
            } catch (error) {
                console.warn(`⚠️  Warning: Error parsing row ${idx + 2}:`, error.message);
                return null;
            }
        })
        .filter(row => row !== null && row.date !== null); // Filter out invalid rows

    console.log(`✅ Successfully transformed ${transformed.length} valid rows`);
    return transformed;
}

/**
 * Insert data into Supabase in batches
 */
async function insertToSupabase(data) {
    const BATCH_SIZE = 100;
    const totalBatches = Math.ceil(data.length / BATCH_SIZE);

    console.log(`\n📤 Uploading ${data.length} rows to Supabase in ${totalBatches} batches...`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;

        try {
            const { data: inserted, error } = await supabase
                .from('rejection_log')
                .insert(batch)
                .select();

            if (error) {
                console.error(`❌ Batch ${batchNum}/${totalBatches} failed:`, error.message);
                errorCount += batch.length;
            } else {
                successCount += inserted.length;
                console.log(`✅ Batch ${batchNum}/${totalBatches} uploaded (${inserted.length} rows)`);
            }
        } catch (error) {
            console.error(`❌ Batch ${batchNum}/${totalBatches} error:`, error.message);
            errorCount += batch.length;
        }
    }

    return { successCount, errorCount };
}

/**
 * Main migration function
 */
async function migrate() {
    console.log('🚀 Starting data migration...\n');
    console.log(`📍 Source: Google Sheets (${BACKEND_SHEET_ID})`);
    console.log(`📍 Destination: Supabase (${SUPABASE_URL})\n`);

    try {
        // Step 1: Fetch data from Google Sheets
        const rows = await fetchGoogleSheetData();

        if (rows.length === 0) {
            console.log('⚠️  No data found in Google Sheets');
            return;
        }

        // Step 2: Transform data
        const transformedData = transformData(rows);

        if (transformedData.length === 0) {
            console.log('⚠️  No valid data to migrate');
            return;
        }

        // Step 3: Insert into Supabase
        const { successCount, errorCount } = await insertToSupabase(transformedData);

        // Summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 Migration Summary:');
        console.log('='.repeat(50));
        console.log(`✅ Successfully migrated: ${successCount} rows`);
        console.log(`❌ Failed: ${errorCount} rows`);
        console.log(`📈 Total processed: ${transformedData.length} rows`);
        console.log('='.repeat(50));

        if (successCount > 0) {
            console.log('\n🎉 Migration completed! Your dashboard should now show historical data.');
            console.log('💡 Refresh your browser at http://localhost:5173 to see the data.');
        }

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        process.exit(1);
    }
}

// Run migration
migrate();
