import { createClient } from '@supabase/supabase-js';
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

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
    console.log('Checking for lamination columns in rejection_log...');

    // Try to select the specific columns. If they don't exist, this will error.
    const { data, error } = await supabase
        .from('rejection_log')
        .select('lamination, lam_rej')
        .limit(1);

    if (error) {
        console.error('Error:', error.message);
        if (error.code === 'PGRST204') { // Column not found
            console.log('Confirmed: Columns are missing or renamed.');
        } else {
            console.log('Error Code:', error.code);
        }
    } else {
        console.log('Success! Columns exist. Sample data:', data);
    }
}

checkColumns();
