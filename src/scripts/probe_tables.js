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

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const POTENTIAL_TABLES = [
    'print_media', 'lamination', 'printers', 'printer', 'media',
    'materials', 'master_data', 'configurations', 'settings',
    'dropdowns', 'options', 'lookup', 'definitions', 'products',
    'items', 'specifications', 'specs', 'inventory', 'stock'
];

async function probeTables() {
    console.log('Probing Supabase for potential master data tables...');
    const found = [];

    for (const table of POTENTIAL_TABLES) {
        const { count, error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });

        if (!error) {
            console.log(`[FOUND] Table '${table}' exists.`);
            found.push(table);
        } else {
            // 404 means not found usually, but sometimes permissions verify
        }
    }

    if (found.length === 0) {
        console.log('No standard master data tables found in the public schema.');
    } else {
        console.log('Found the following tables:', found);

        // Inspect content of found tables
        for (const table of found) {
            const { data } = await supabase.from(table).select('*').limit(3);
            console.log(`\nSample data for '${table}':`, data);
        }
    }
}

probeTables();
