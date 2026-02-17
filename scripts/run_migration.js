/**
 * Data Migration Script: JSON → Supabase
 * 
 * This script migrates historical rejection log data from a JSON file
 * to Supabase.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Parse numeric value
 */
function parseNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return value;
    const cleaned = value.toString().replace(/[%,]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

/**
 * Parse date string to ISO format (YYYY-MM-DD)
 */
function parseDate(dateStr) {
    if (!dateStr) return null;
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return null;
        return date.toISOString().split('T')[0];
    } catch (error) {
        return null;
    }
}

/**
 * Main migration function
 */
async function migrate(jsonData) {
    console.log(`🚀 Starting data migration of ${jsonData.length} records...\n`);

    const transformedData = jsonData.map(item => ({
        date: parseDate(item.Date || item.Timestamp),
        client_name: item["Client Name"] || "",
        vertical: item.Vertical || "",
        project_name: item["Project Name"] || "",
        product: item["Product / Panel"] || "",
        print_media: item["Print Media"] || "",
        lamination: item["Lamination Media"] || "",
        printer_model: item["Printer Model"] || "",
        size: item.Size || "",
        master_qty: parseNumber(item["Master Qty"]),
        batch_qty: parseNumber(item["Batch Qty"]),
        design_rej: parseNumber(item["Design File Rejection"]),
        print_rej: parseNumber(item["Printing Rejection"]),
        lam_rej: parseNumber(item["Lamination Rejection"]),
        cut_rej: parseNumber(item["Cut Rejection"]),
        pack_rej: parseNumber(item["Packaging Rejection"]),
        media_rej: parseNumber(item["Media Rejection"]),
        qty_rejected: parseNumber(item["Qty Rejected"]),
        qty_delivered: parseNumber(item["Qty Delivered"]),
        rejection_percent: parseNumber(item["Rejection %"]),
        in_stock: parseNumber(item["In Stock"]),
        reason: item["Rejection Reason"] || ""
    })).filter(row => row.date !== null);

    console.log(`✅ Transformed ${transformedData.length} valid records.`);

    const BATCH_SIZE = 50;
    for (let i = 0; i < transformedData.length; i += BATCH_SIZE) {
        const batch = transformedData.slice(i, i + BATCH_SIZE);
        console.log(`📤 Uploading batch ${Math.floor(i / BATCH_SIZE) + 1}...`);

        const { error } = await supabase
            .from('rejection_log')
            .insert(batch);

        if (error) {
            console.error('❌ Error uploading batch:', error.message);
        }
    }

    console.log('\n🎉 Migration completed!');
}

// Since I have the data from the browser subagent, I'll invoke this with the data directly
// In a real scenario, this would read from a file.
const data = JSON_DATA_HERE;
migrate(data);
