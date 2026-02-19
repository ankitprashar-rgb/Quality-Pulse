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

async function checkTables() {
    console.log('Checking for potential master data tables...');

    // We can't list tables directly with JS client usually, so we'll guess common names
    const potentialTables = [
        'print_media', 'lamination', 'printers', 'media_options', 'master_data',
        'configurations', 'dropdowns', 'lists', 'materials'
    ];

    for (const table of potentialTables) {
        process.stdout.write(`Checking table '${table}'... `);
        const { data, error } = await supabase.from(table).select('*').limit(1);

        if (!error) {
            console.log('FOUND!');
            console.log('Sample data:', data);
        } else {
            console.log('Not found or no access.');
        }
    }

    // Also check rejection_log lamination values distribution
    console.log('\nChecking existing "lamination" values in rejection_log...');
    const { data: logs, error: logError } = await supabase
        .from('rejection_log')
        .select('lamination')
        .not('lamination', 'is', null)
        .limit(20);

    if (logError) {
        console.error('Error fetching logs:', logError.message);
    } else {
        const unique = [...new Set(logs.map(l => l.lamination))];
        console.log('Found lamination values:', unique);
    }
}

checkTables();
