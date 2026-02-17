import { fetchRejectionLogs } from './supabase';
import { calculateRejectionRate } from '../utils/helpers';

/**
 * Generates and sends the monthly quality analysis report via email
 */
export async function sendMonthlyQualityReport(customPeriod = null, summaryText = '') {
    const today = new Date();
    let targetDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    if (customPeriod) {
        // Assume format 'YYYY-MM'
        const [y, m] = customPeriod.split('-').map(Number);
        targetDate = new Date(y, m - 1, 1);
    }

    const firstDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).toISOString().split('T')[0];
    const monthLabel = targetDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    console.log(`Generating report for: ${monthLabel} (${firstDay} to ${lastDay})`);

    const logs = await fetchRejectionLogs({ fromDate: firstDay, toDate: lastDay });

    if (!logs || logs.length === 0) {
        throw new Error(`No data found for ${monthLabel}. Report cannot be generated.`);
    }

    const reportData = aggregateMonthlyData(logs);
    reportData.monthLabel = monthLabel;

    // Send to GAS Bridge
    const GAS_URL = import.meta.env.VITE_API_BASE_URL;

    const response = await fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors', // Apps Script handles redirects which CORS blocks
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'sendMonthlyQualityReport',
            email: 'info@IDEautoworks.com',
            ...reportData
        })
    });

    // Note: with no-cors, we can't read the response, but the fetch will succeed if the request is dispatched.
    return { success: true, month: monthLabel };
}

/**
 * Aggregates raw logs into reportable metrics
 */
function aggregateMonthlyData(logs) {
    const verticalStats = {
        'IDE Autoworks': { rejected: 0, master: 0 },
        'IDE Commercial': { rejected: 0, master: 0 },
        'Subumi': { rejected: 0, master: 0 }
    };

    const stageRejections = {
        design: 0, print: 0, lam: 0, cut: 0, pack: 0, media: 0
    };

    // Track unique products to avoid master qty double counting
    const uniqueProducts = new Map();
    let totalRejected = 0;

    logs.forEach(log => {
        const prodKey = `${log.client_name}|||${log.project_name}|||${log.product}`;
        if (!uniqueProducts.has(prodKey)) {
            uniqueProducts.set(prodKey, {
                master: Number(log.master_qty) || 0,
                vertical: log.vertical
            });
        }

        const rej = Number(log.qty_rejected) || 0;
        totalRejected += rej;

        if (verticalStats[log.vertical]) {
            verticalStats[log.vertical].rejected += rej;
        }

        stageRejections.design += Number(log.design_rej) || 0;
        stageRejections.print += Number(log.print_rej) || 0;
        stageRejections.lam += Number(log.lam_rej) || 0;
        stageRejections.cut += Number(log.cut_rej) || 0;
        stageRejections.pack += Number(log.pack_rej) || 0;
        stageRejections.media += Number(log.media_rej) || 0;
    });

    let totalMaster = 0;
    Object.values(verticalStats).forEach(v => (v.master = 0)); // Reset for correct re-summing

    for (const info of uniqueProducts.values()) {
        totalMaster += info.master;
        if (verticalStats[info.vertical]) {
            verticalStats[info.vertical].master += info.master;
        }
    }

    // Top Rejection Areas (Stages)
    const topStages = Object.entries(stageRejections)
        .map(([name, count]) => ({ name, count, rate: calculateRejectionRate(count, totalMaster) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

    // High Impact Projects
    const projectAgg = {};
    logs.forEach(log => {
        const key = `${log.client_name} - ${log.project_name}`;
        if (!projectAgg[key]) projectAgg[key] = { rejected: 0, master: 0 };
        projectAgg[key].rejected += Number(log.qty_rejected) || 0;
        projectAgg[key].master = Number(log.master_qty) || 0; // Approximate
    });

    const topProjects = Object.entries(projectAgg)
        .map(([name, data]) => ({
            name,
            rejected: data.rejected,
            rate: calculateRejectionRate(data.rejected, data.master)
        }))
        .sort((a, b) => b.rejected - a.rejected)
        .slice(0, 5);

    return {
        overall: {
            rate: calculateRejectionRate(totalRejected, totalMaster),
            totalRejected,
            totalMaster
        },
        verticals: Object.entries(verticalStats).map(([name, data]) => ({
            name,
            rate: calculateRejectionRate(data.rejected, data.master),
            rejected: data.rejected
        })),
        stages: Object.entries(stageRejections).map(([name, count]) => ({
            name: name.charAt(0).toUpperCase() + name.slice(1),
            count,
            rate: calculateRejectionRate(count, totalMaster)
        })).sort((a, b) => b.count - a.count),
        topStages,
        topProjects
    };
}
