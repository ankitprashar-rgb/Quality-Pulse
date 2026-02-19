import { getAccessToken } from './googleAuth';

const CENTRAL_SHEET_ID = import.meta.env.VITE_CENTRAL_SHEET_ID;

/**
 * Fetch data from Google Sheets using service account auth
 */
async function fetchSheetData(sheetId, range) {
    try {
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
    } catch (error) {
        console.error('Error fetching sheet data:', error);
        return [];
    }
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
    } catch (error) {
        console.error('Error appending to sheet:', error);
        throw error;
    }
}
