
import { getAccessToken } from '../src/services/googleAuth.js';

const BACKEND_SHEET_ID = '1PDWBktsa6WDa-waadkviayR7wEVPiTN3S9SogROlXU8';

// MOCK the function exactly as it is in googleSheets.js
async function fetchProjectDeliveredStats(clientName, projectName) {
    console.log(`\n--- Fetching Stats for ---`);
    console.log(`Client: "${clientName}"`);
    console.log(`Project: "${projectName}"`);

    // 1. Fetch
    const token = await getAccessToken();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${BACKEND_SHEET_ID}/values/'Rejection Log'!A:Z`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await response.json();
    const rows = json.values || [];

    if (rows.length === 0) return {};

    // 2. Parse
    const headers = rows[0].map(h => (h || '').trim());
    console.log('Headers:', headers);

    const data = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const obj = {};
        headers.forEach((header, index) => {
            if (header) obj[header] = row[index] || '';
        });
        data.push(obj);
    }

    // 3. Filter
    const targetProject = (projectName || '').trim().toLowerCase();
    const targetClient = (clientName || '').trim().toLowerCase();

    const stats = {};

    let matchCount = 0;

    data.forEach((row, idx) => {
        const getValue = (obj, keys) => {
            const foundKey = keys.find(k => obj.hasOwnProperty(k));
            return foundKey ? obj[foundKey] : '';
        };

        const pName = (getValue(row, ['Project Name', 'Project']) || '').trim().toLowerCase();
        const cName = (getValue(row, ['Client Name', 'Client']) || '').trim().toLowerCase();

        // Debug specific row if it looks close
        if (pName.includes('iceland') || idx === data.length - 1) {
            console.log(`Row ${idx + 1}: Client="${cName}", Project="${pName}"`);
            console.log(`   TargetClient="${targetClient}", TargetProject="${targetProject}"`);
            console.log(`   Match Client? ${cName === targetClient}`);
            console.log(`   Match Project? ${pName === targetProject}`);
        }

        if (pName === targetProject && cName === targetClient) {
            matchCount++;
            const product = (getValue(row, ['Product / Panel', 'Product', 'Panel']) || '').trim().toLowerCase();
            const deliveredRaw = getValue(row, ['Qty Delivered', 'Delivered']);
            const delivered = parseFloat(deliveredRaw) || 0;

            console.log(`   -> MATCH! Product="${product}", DeliveredRaw="${deliveredRaw}", Delivered=${delivered}`);

            if (product) {
                stats[product] = (stats[product] || 0) + delivered;
            }
        }
    });

    console.log(`Total Matches: ${matchCount}`);
    console.log('Final Stats:', stats);
    return stats;
}

// (async () => {
// Run with the exact data provided by user
await fetchProjectDeliveredStats('Adventures Overland', 'Super Car Drive Jan 2026');
// })();
