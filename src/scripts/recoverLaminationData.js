import { createClient } from '@supabase/supabase-js/dist/index.cjs';
import fs from 'fs';
import path from 'path';

// Manual .env parser
function loadEnv() {
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        const envFile = fs.readFileSync(envPath, 'utf8');
        const env = {};
        envFile.split('\n').forEach(line => {
            const [key, val] = line.split('=');
            if (key && val) env[key.trim()] = val.trim();
        });
        return env;
    } catch (e) {
        console.error('Error loading .env:', e);
        return {};
    }
}

const env = loadEnv();
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
const spreadsheetId = env.VITE_CENTRAL_SHEET_ID;
const apiKey = env.VITE_GOOGLE_API_KEY;

if (!supabaseUrl || !supabaseKey || !spreadsheetId || !apiKey) {
    console.error('Missing credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to fetch sheet data via REST (since googleapis is acting up with auth sometimes)
async function fetchSheetValues(range) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${apiKey}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        return data.values || [];
    } catch (error) {
        console.error('Error fetching sheet:', error);
        return [];
    }
}

// Helper to parse sheet data
function parseSheetData(rows) {
    if (!rows || rows.length === 0) return [];
    const headers = rows[0].map(h => (h || '').trim());
    const data = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const obj = {};
        headers.forEach((header, index) => {
            if (header) obj[header] = row[index] || '';
        });
        data.push(obj);
    }
    return data;
}

function getValue(obj, keys) {
    const foundKey = keys.find(k => obj.hasOwnProperty(k));
    return foundKey ? obj[foundKey] : '';
}

async function runMigration() {
    console.log('Fetching Supabase rejection logs with missing metadata...');

    // Fetch logs where lamination OR print_media is null/empty
    const { data: logs, error } = await supabase
        .from('rejection_log')
        .select('*');
    //.or('lamination.is.null,lamination.eq."",print_media.is.null,print_media.eq.""');

    if (error) {
        console.error('Error fetching logs:', error.message);
        return;
    }

    console.log(`Found ${logs.length} total logs. Checking for missing data...`);

    // Fetch Master Project Data
    console.log('Fetching Master Project Data from Google Sheets...');
    const rows = await fetchSheetValues('Project_WorkOrder!A:Z');
    const projects = parseSheetData(rows);
    console.log(`Fetched ${projects.length} project records from Sheet.`);

    let updatedCount = 0;

    for (const log of logs) {
        // Skip if both fields are already present
        if (log.lamination && log.print_media) continue;

        const client = (log.client_name || '').trim();
        const project = (log.project_name || '').trim();
        const product = (log.product || '').trim();

        // Find match in Sheet
        // We match strictly on Client, Project, and Product
        const match = projects.find(p => {
            const pClient = (getValue(p, ['Client Name', 'Client']) || '').trim();
            const pProject = (getValue(p, ['Project Name', 'Project']) || '').trim();
            const pProduct = (getValue(p, ['Product Name', 'Product / Panel', 'Product', 'Panel']) || '').trim();

            return pClient === client && pProject === project && pProduct === product;
        });

        if (match) {
            const updates = {};
            const sheetLam = getValue(match, ['Lamination', 'Lamination Media', 'Lam Media']);
            const sheetPrint = getValue(match, ['Print Media', 'Media']);

            if (!log.lamination && sheetLam) {
                updates.lamination = sheetLam;
            }
            if (!log.print_media && sheetPrint) {
                updates.print_media = sheetPrint;
            }

            if (Object.keys(updates).length > 0) {
                // console.log(`Updating Log ID ${log.id}:`, updates);
                const { error: updateError } = await supabase
                    .from('rejection_log')
                    .update(updates)
                    .eq('id', log.id);

                if (updateError) {
                    console.error(`Failed to update log ${log.id}:`, updateError.message);
                } else {
                    updatedCount++;
                    process.stdout.write('.');
                }
            }
        }
    }

    console.log(`\nMigration Complete. Updated ${updatedCount} records.`);
}

runMigration();
