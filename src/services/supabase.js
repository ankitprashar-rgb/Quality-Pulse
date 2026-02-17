import { supabase } from '../lib/supabase';
import { calculateRejectionRate, strictTruncate } from '../utils/helpers';

/**
 * Fetch all rejection log entries
 */
export async function fetchRejectionLogs(filters = {}) {
    let query = supabase
        .from('rejection_log')
        .select('*')
        .order('date', { ascending: false });

    // Apply filters
    if (filters.clientName) {
        query = query.eq('client_name', filters.clientName);
    }
    if (filters.projectName) {
        query = query.eq('project_name', filters.projectName);
    }
    if (filters.vertical) {
        query = query.eq('vertical', filters.vertical);
    }
    if (filters.fromDate) {
        query = query.gte('date', filters.fromDate);
    }
    if (filters.toDate) {
        query = query.lte('date', filters.toDate);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching rejection logs:', error);
        return [];
    }

    return data || [];
}

/**
 * Save new rejection entry
 */
export async function saveRejectionEntry(entry) {
    // Calculate derived fields
    const totalRejected =
        (entry.design_rej || 0) +
        (entry.print_rej || 0) +
        (entry.lam_rej || 0) +
        (entry.cut_rej || 0) +
        (entry.pack_rej || 0) +
        (entry.media_rej || 0);

    const qtyDelivered = (entry.batch_qty || 0) - totalRejected;
    const rejectionPercent = calculateRejectionRate(totalRejected, entry.master_qty || 0);
    const inStock = Math.max(0, qtyDelivered - (entry.master_qty || 0));

    const payload = {
        ...entry,
        qty_rejected: strictTruncate(totalRejected),
        qty_delivered: strictTruncate(qtyDelivered),
        rejection_percent: rejectionPercent,
        in_stock: strictTruncate(inStock)
    };

    const { data, error } = await supabase
        .from('rejection_log')
        .insert([payload])
        .select();

    if (error) {
        console.error('Error saving rejection entry:', error);
        throw error;
    }

    return data[0];
}

/**
 * Update existing rejection entry
 */
export async function updateRejectionEntry(id, entry) {
    // Recalculate derived fields
    const totalRejected =
        (entry.design_rej || 0) +
        (entry.print_rej || 0) +
        (entry.lam_rej || 0) +
        (entry.cut_rej || 0) +
        (entry.pack_rej || 0) +
        (entry.media_rej || 0);

    const qtyDelivered = (entry.batch_qty || 0) - totalRejected;
    const rejectionPercent = calculateRejectionRate(totalRejected, entry.master_qty || 0);
    const inStock = Math.max(0, qtyDelivered - (entry.master_qty || 0));

    const payload = {
        ...entry,
        qty_rejected: strictTruncate(totalRejected),
        qty_delivered: strictTruncate(qtyDelivered),
        rejection_percent: rejectionPercent,
        in_stock: strictTruncate(inStock)
    };

    const { data, error } = await supabase
        .from('rejection_log')
        .update(payload)
        .eq('id', id)
        .select();

    if (error) {
        console.error('Error updating rejection entry:', error);
        throw error;
    }

    return data[0];
}

/**
 * Delete rejection entry
 */
export async function deleteRejectionEntry(id) {
    const { error } = await supabase
        .from('rejection_log')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting rejection entry:', error);
        throw error;
    }

    return true;
}

/**
 * Calculate quality metrics
 */
export async function calculateMetrics(mode = 'all') {
    let query = supabase.from('rejection_log').select('*');

    // Apply time filters
    const today = new Date();
    if (mode === 'today') {
        const todayStr = today.toISOString().split('T')[0];
        query = query.eq('date', todayStr);
    } else if (mode === 'month') {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const firstDayStr = firstDay.toISOString().split('T')[0];
        query = query.gte('date', firstDayStr);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error calculating metrics:', error);
        return null;
    }

    const entries = data || [];

    // Tracks unique master quantities to avoid double counting across batches
    const productMasterMap = new Map();

    let totalRejected = 0;
    let autoRejected = 0, commRejected = 0, subumiRejected = 0;
    let designRej = 0, printRej = 0, lamRej = 0, cutRej = 0, packRej = 0, mediaRej = 0;

    entries.forEach(entry => {
        const pKey = `${(entry.client_name || '').trim()}|||${(entry.project_name || '').trim()}`;
        const prodKey = `${pKey}|||${(entry.product || '').trim()}`;

        if (!productMasterMap.has(prodKey)) {
            productMasterMap.set(prodKey, {
                master: Number(entry.master_qty) || 0,
                vertical: entry.vertical
            });
        }

        const rej = Number(entry.qty_rejected) || 0;
        totalRejected += rej;
        if (entry.vertical === 'IDE Autoworks') autoRejected += rej;
        else if (entry.vertical === 'IDE Commercial') commRejected += rej;
        else if (entry.vertical === 'Subumi') subumiRejected += rej;

        designRej += entry.design_rej || 0;
        printRej += entry.print_rej || 0;
        lamRej += entry.lam_rej || 0;
        cutRej += entry.cut_rej || 0;
        packRej += entry.pack_rej || 0;
        mediaRej += entry.media_rej || 0;
    });

    let totalMaster = 0, autoMaster = 0, commMaster = 0, subumiMaster = 0;
    for (const info of productMasterMap.values()) {
        totalMaster += info.master;
        if (info.vertical === 'IDE Autoworks') autoMaster += info.master;
        else if (info.vertical === 'IDE Commercial') commMaster += info.master;
        else if (info.vertical === 'Subumi') subumiMaster += info.master;
    }

    return {
        overallRate: calculateRejectionRate(totalRejected, totalMaster),
        autoRate: calculateRejectionRate(autoRejected, autoMaster),
        commRate: calculateRejectionRate(commRejected, commMaster),
        subumiRate: calculateRejectionRate(subumiRejected, subumiMaster),
        designRate: calculateRejectionRate(designRej, totalMaster),
        printingRate: calculateRejectionRate(printRej, totalMaster),
        laminationRate: calculateRejectionRate(lamRej, totalMaster),
        cutRate: calculateRejectionRate(cutRej, totalMaster),
        packagingRate: calculateRejectionRate(packRej, totalMaster),
        mediaRate: calculateRejectionRate(mediaRej, totalMaster),
        targetRate: 3.0
    };
}

/**
 * Migration utility: Recalculate all rejection percentages and stock values
 */
export async function migrateHistoricalData() {
    const { data: records, error: fetchError } = await supabase
        .from('rejection_log')
        .select('*');

    if (fetchError) {
        console.error('Error fetching for migration:', fetchError);
        return false;
    }

    console.log(`Starting migration for ${records.length} records...`);

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

        await supabase
            .from('rejection_log')
            .update({
                qty_rejected: strictTruncate(totalRejected),
                qty_delivered: strictTruncate(qtyDelivered),
                rejection_percent: rejectionPercent,
                in_stock: strictTruncate(inStock)
            })
            .eq('id', record.id);
    }

    console.log('Migration complete.');
    return true;
}
