import { getAccessToken } from './googleAuth';

const CENTRAL_SHEET_ID = import.meta.env.VITE_CENTRAL_SHEET_ID;

/**
 * Fetch data from Google Sheets using service account auth
 */
async function fetchSheetData(sheetId, range) {
    const token = await getAccessToken();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;

    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google Sheets API error (${response.status}): ${errText}`);
    }
    const data = await response.json();
    return data.values || [];
}

/**
 * Parse sheet data into objects with headers (trimmed for robustness)
 */
function parseSheetData(rows) {
    if (!rows || rows.length === 0) return [];

    const headers = rows[0].map(h => (h || '').trim());
    const data = [];

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const obj = {};
        headers.forEach((header, index) => {
            if (header) {
                obj[header] = row[index] || '';
            }
        });
        data.push(obj);
    }

    return data;
}

/** Helper to get value using multiple possible header names */
function getValue(obj, keys) {
    const foundKey = keys.find(k => obj.hasOwnProperty(k));
    return foundKey ? obj[foundKey] : '';
}

/**
 * Fetch clients from Central Master sheet — tab: Clients
 */
export async function fetchClients() {
    const rows = await fetchSheetData(CENTRAL_SHEET_ID, 'Clients!A:C');
    const clients = parseSheetData(rows);

    const mappedClients = clients.map(c => ({
        name: (getValue(c, ['Client Name', 'Client']) || '').trim(),
        vertical: getValue(c, ['Vertical']),
        contact: getValue(c, ['Contact'])
    })).filter(c => c.name);

    // Deduplicate: Keep exact string matches only once (case-sensitive)
    const seen = new Set();
    const uniqueClients = [];

    for (const client of mappedClients) {
        // "A" !== "a", so this preserves case mismatched duplicates as requested
        if (!seen.has(client.name)) {
            seen.add(client.name);
            uniqueClients.push(client);
        }
    }

    return uniqueClients;
}

/**
 * Fetch projects for a specific client — tab: Project_WorkOrder
 */
export async function fetchProjectsForClient(clientName) {
    const rows = await fetchSheetData(CENTRAL_SHEET_ID, 'Project_WorkOrder!A:Z');
    const projects = parseSheetData(rows);

    const targetClient = (clientName || '').trim();

    return projects
        .filter(p => (getValue(p, ['Client Name', 'Client']) || '').trim() === targetClient)
        .map(p => ({
            client: getValue(p, ['Client Name', 'Client']),
            project: (getValue(p, ['Project Name', 'Project']) || '').trim(),
            vertical: getValue(p, ['Vertical']),
            product: getValue(p, ['Product Name', 'Product / Panel', 'Product', 'Panel']),
            masterQty: parseFloat(getValue(p, ['Master Qty', 'Quantity', 'Qty'])) || 0,
            deliveryDate: getValue(p, ['Delivery Date', 'Due Date']),
            printMedia: getValue(p, ['Print Media', 'Media']),
            lamMedia: getValue(p, ['Lamination', 'Lamination Media', 'Lam Media']),
            size: getValue(p, ['Size']),
            printerModel: getValue(p, ['Printer Model', 'Printer']),
            approvalDate: getValue(p, ['Approval Date'])
        }));
}

/**
 * Fetch all projects (for Pending Production) — tab: Project_WorkOrder
 */
export async function fetchAllProjects() {
    const rows = await fetchSheetData(CENTRAL_SHEET_ID, 'Project_WorkOrder!A:Z');
    const projects = parseSheetData(rows);

    return projects.map(p => ({
        client: getValue(p, ['Client Name', 'Client']),
        project: getValue(p, ['Project Name', 'Project']),
        vertical: getValue(p, ['Vertical']),
        product: getValue(p, ['Product Name', 'Product / Panel', 'Product', 'Panel']),
        masterQty: parseFloat(getValue(p, ['Master Qty', 'Quantity', 'Qty'])) || 0,
        deliveryDate: getValue(p, ['Delivery Date', 'Due Date']),
        printMedia: getValue(p, ['Print Media', 'Media']),
        lamMedia: getValue(p, ['Lamination', 'Lamination Media', 'Lam Media']),
        size: getValue(p, ['Size']),
        printerModel: getValue(p, ['Printer Model', 'Printer']),
        approvalDate: getValue(p, ['Approval Date'])
    })).filter(p => p.client && p.project);
}

/**
 * Fetch media options — tab: Media_Options
 */
export async function fetchMediaOptions() {
    const rows = await fetchSheetData(CENTRAL_SHEET_ID, 'Media_Options!A:D');
    const data = parseSheetData(rows);

    const printMedia = [];
    const lamMedia = [];
    const printers = [];
    const sizes = [];

    data.forEach(row => {
        if (row['Print Media']) printMedia.push(row['Print Media']);
        if (row['Lamination']) lamMedia.push(row['Lamination']);
        if (row['Printer Model']) printers.push(row['Printer Model']);
        if (row['Size']) sizes.push(row['Size']);
    });

    return {
        printMedia: [...new Set(printMedia)].filter(Boolean),
        lamMedia: [...new Set(lamMedia)].filter(Boolean),
        printers: [...new Set(printers)].filter(Boolean),
        sizes: [...new Set(sizes)].filter(Boolean)
    };
}

/**
 * Append rejection entry to the backend master sheet
 */
export async function appendRejectionToSheet(entry) {
    const BACKEND_SHEET_ID = import.meta.env.VITE_BACKEND_SHEET_ID;
    if (!BACKEND_SHEET_ID) {
        console.error('VITE_BACKEND_SHEET_ID not found');
        return;
    }

    try {
        const token = await getAccessToken();
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${BACKEND_SHEET_ID}/values/'Rejection Log'!A:Z:append?valueInputOption=USER_ENTERED`;

        // Headers strictly followed:
        // Timestamp, Date, Client Name, Project Name, Vertical, Size, Print Media, Lamination Media, Printer Model, Product / Panel, Master Qty, Batch Qty, Qty Delivered, In Stock, Qty Rejected, Rejection %, Rejection Reason, Design File Rejection, Printing Rejection, Lamination Rejection, Cut Rejection, Packaging Rejection, Media Rejection, Design Rejection Images, Printing Rejection Images, Lamination Rejection Images, Printing Rejection Images, Packaging Rejection Images, Media Rejection Images

        const values = [[
            new Date().toLocaleString(), // Timestamp
            entry.date,
            entry.client_name,
            entry.project_name,
            entry.vertical,
            entry.size,
            entry.print_media,
            entry.lamination,
            entry.printer_model || '',
            entry.product,
            entry.master_qty,
            entry.batch_qty,
            entry.qty_delivered,
            entry.in_stock,
            entry.qty_rejected,
            entry.rejection_percent + '%',
            entry.reason,
            entry.design_rej,
            entry.print_rej,
            entry.lam_rej,
            entry.cut_rej,
            entry.pack_rej,
            entry.media_rej,
            entry.images?.design || '',
            entry.images?.print || '',
            entry.images?.lamination || '',
            entry.images?.cut || '', // Note: User repeating Print in headers but logic dictates Cut
            entry.images?.packaging || '',
            entry.images?.media || ''
        ]];

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Sheets append failed: ${err}`);
        }

        return await response.json();
        return await response.json();
    } catch (error) {
        console.error('Error appending to sheet:', error);
        throw error;
    }
}

/**
 * Delete a rejection entry from the Google Sheet by matching its content.
 * Since we don't store row IDs, we must find the row that matches critical fields.
 */
export async function deleteRejectionRow(entry) {
    const BACKEND_SHEET_ID = import.meta.env.VITE_BACKEND_SHEET_ID;
    if (!BACKEND_SHEET_ID) return;

    try {
        const token = await getAccessToken();

        // 1. Fetch all rows to find the index
        // Limit to last 1000 rows for performance if possible, but for safety fetch all for now
        // Assuming 'Rejection Log' is the sheet name
        const rows = await fetchSheetData(BACKEND_SHEET_ID, 'Rejection Log!A:Z');
        const headers = rows[0].map(h => (h || '').trim());

        // Helper to get index
        const getIdx = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));

        const idxClient = getIdx('Client');
        const idxProject = getIdx('Project');
        const idxProduct = getIdx('Product');
        const idxDate = getIdx('Date');
        const idxRejQty = getIdx('Qty Rejected');

        if (idxClient === -1 || idxProject === -1) {
            console.error('Could not find required headers to match row for deletion');
            return;
        }

        // 2. Find the row index (1-based for API, but array is 0-based)
        // We search from the END because recent entries are at the bottom
        let rowIndexToDelete = -1;

        for (let i = rows.length - 1; i >= 1; i--) {
            const r = rows[i];

            // Loose matching (case-insensitive + trimmed)
            const rowClient = (r[idxClient] || '').trim().toLowerCase();
            const rowProject = (r[idxProject] || '').trim().toLowerCase();
            const rowProduct = (r[idxProduct] || '').trim().toLowerCase();

            const targetClient = (entry.client_name || '').trim().toLowerCase();
            const targetProject = (entry.project_name || '').trim().toLowerCase();
            const targetProduct = (entry.product || '').trim().toLowerCase();

            const matchClient = rowClient === targetClient;
            const matchProject = rowProject === targetProject;
            const matchProduct = rowProduct === targetProduct;

            // Numeric tolerance for quantity (epsilon = 0.05)
            const rowQty = parseFloat(r[idxRejQty]);
            const targetQty = parseFloat(entry.qty_rejected);

            const matchQty = !isNaN(rowQty) && !isNaN(targetQty) && Math.abs(rowQty - targetQty) < 0.05;

            if (matchClient && matchProject && matchProduct && matchQty) {
                rowIndexToDelete = i;
                break;
            }
        }

        if (rowIndexToDelete === -1) {
            console.warn('Google Sheet row not found for deletion:', entry);
            return;
        }

        console.log(`Deleting Google Sheet row ${rowIndexToDelete + 1} for ${entry.client_name} - ${entry.product}`);

        // 3. Delete the row using batchUpdate
        // sheetId is needed here. We need to fetch sheet metadata to get the integer sheetId (gid)
        const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${BACKEND_SHEET_ID}`;
        const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
        const meta = await metaRes.json();

        const sheet = meta.sheets.find(s => s.properties.title === 'Rejection Log');
        if (!sheet) {
            console.error('Sheet "Rejection Log" not found');
            return;
        }
        const sheetId = sheet.properties.sheetId;

        const deleteRequest = {
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: sheetId,
                        dimension: "ROWS",
                        startIndex: rowIndexToDelete,
                        endIndex: rowIndexToDelete + 1
                    }
                }
            }]
        };

        const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${BACKEND_SHEET_ID}:batchUpdate`;
        await fetch(batchUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(deleteRequest)
        });

        console.log('Google Sheet row deleted successfully.');

    } catch (error) {
        console.error('Error deleting from Google Sheet:', error);
        // Don't throw, so we don't block the UI if sheet deletion fails (it's secondary)
    }
}

/**
 * Fetch total delivered quantity for each product in a project
 * Returns a map: { "Product Name": totalDeliveredQty }
 */
export async function fetchProjectDeliveredStats(clientName, projectName) {
    const BACKEND_SHEET_ID = import.meta.env.VITE_BACKEND_SHEET_ID;
    if (!BACKEND_SHEET_ID || !projectName || !clientName) return {};

    const rows = await fetchSheetData(BACKEND_SHEET_ID, 'Rejection Log!A:Z');
    const data = parseSheetData(rows);
    const targetProject = (projectName || '').trim().toLowerCase();
    const targetClient = (clientName || '').trim().toLowerCase();

    const stats = {};

    data.forEach(row => {
        const pName = (getValue(row, ['Project Name', 'Project']) || '').trim().toLowerCase();
        const cName = (getValue(row, ['Client Name', 'Client']) || '').trim().toLowerCase();

        if (pName === targetProject && cName === targetClient) {
            const product = (getValue(row, ['Product / Panel', 'Product', 'Panel']) || '').trim().toLowerCase();
            const delivered = parseFloat(getValue(row, ['Qty Delivered', 'Delivered'])) || 0;

            if (product) {
                // Normalize key for stats map: lowercase + no spaces
                const key = product.replace(/\s+/g, '');
                stats[key] = (stats[key] || 0) + delivered;
            }
        }
    });

    return stats;
}
