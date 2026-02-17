const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://trgvsjirzofgkheaqzne.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyZ3Zzamlyem9mZ2toZWFxem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NjQ4NjYsImV4cCI6MjA4NTU0MDg2Nn0.bweq2J-wDl1oRwOyEyNQNUAPlv0McITB3XoxNX64L-Y';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function calculateRejectionRate(rejected, total) {
    if (!total || total === 0) return 0;
    const n = Number((rejected / total) * 100);
    const factor = Math.pow(10, 2);
    return Math.trunc(n * factor) / factor;
}

function strictTruncate(val, precision = 3) {
    const n = Number(val);
    if (isNaN(n) || !isFinite(n)) return 0;
    if (Number.isInteger(n)) return n;
    const factor = Math.pow(10, precision);
    return Math.trunc(n * factor) / factor;
}

async function migrate() {
    process.stdout.write('Fetching records... ');
    const { data: records, error: fetchError } = await supabase
        .from('rejection_log')
        .select('*');

    if (fetchError) {
        console.error('Error fetching records:', fetchError);
        return;
    }

    console.log(`Found ${records.length} records.`);

    let successCount = 0;
    for (const record of records) {
        const totalRejected =
            (Number(record.design_rej) || 0) +
            (Number(record.print_rej) || 0) +
            (Number(record.lam_rej) || 0) +
            (Number(record.cut_rej) || 0) +
            (Number(record.pack_rej) || 0) +
            (Number(record.media_rej) || 0);

        const qtyDelivered = (Number(record.batch_qty) || 0) - totalRejected;
        const rejectionPercent = calculateRejectionRate(totalRejected, Number(record.master_qty) || 0);
        const inStock = Math.max(0, qtyDelivered - (Number(record.master_qty) || 0));

        const updates = {
            qty_rejected: strictTruncate(totalRejected),
            qty_delivered: strictTruncate(qtyDelivered),
            rejection_percent: rejectionPercent,
            in_stock: strictTruncate(inStock)
        };

        const { error: updateError } = await supabase
            .from('rejection_log')
            .update(updates)
            .eq('id', record.id);

        if (updateError) {
            console.error(`\nError updating record ${record.id}:`, updateError);
        } else {
            successCount++;
            process.stdout.write('.');
            if (successCount % 50 === 0) process.stdout.write(` (${successCount})\n`);
        }
    }

    console.log(`\nMigration complete. Success: ${successCount}/${records.length}`);
}

migrate();
