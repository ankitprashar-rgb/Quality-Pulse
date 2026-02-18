import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate } from '../utils/helpers';

/**
 * Generate and download a Quality Assurance Report PDF
 * @param {Object} entry - The production entry object (or a processed summary object)
 * @param {Array} lineItems - Array of individual line items associated with the entry/project
 */
export async function generateQualityReport(entry, lineItems) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const today = formatDate(new Date());

    // --- Header ---
    // Logo Placeholder (Top Right) - aligned with title
    doc.setFontSize(22);
    doc.setTextColor(41, 128, 185); // Professional Blue
    doc.text("IDE Autoworks", pageWidth - 15, 20, { align: 'right' });

    // Title (Top Left)
    doc.setFontSize(18);
    doc.setTextColor(50, 50, 50);
    doc.text("Quality Assurance Report", 15, 20);

    // Divider Line
    doc.setLineWidth(0.5);
    doc.setDrawColor(200, 200, 200);
    doc.line(15, 28, pageWidth - 15, 28);

    // --- Meta Data Section ---
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);

    const metaY = 38;
    const col1 = 15;
    const col2 = 80;

    doc.text(`Report Date: ${today}`, col1, metaY);
    doc.text(`Client: ${entry.client_name || 'N/A'}`, col1, metaY + 6);
    doc.text(`Project: ${entry.project_name || 'N/A'}`, col1, metaY + 12);

    doc.text(`Report ID: QC-${today.replace(/-/g, '')}-${(entry.id || 'NEW').toString().slice(-4)}`, col2, metaY);
    doc.text(`Printer: ${entry.printer_model || 'Various'}`, col2, metaY + 6);

    // --- Executive Summary Box ---
    const summaryY = metaY + 20;
    const boxHeight = 25;

    // Metrics calculation
    const totalItems = lineItems.reduce((sum, item) => sum + (parseFloat(item.batch_qty) || 0), 0);
    const totalRejections = lineItems.reduce((sum, item) => {
        const rej = (item.design_rej || 0) + (item.print_rej || 0) + (item.lam_rej || 0) +
            (item.cut_rej || 0) + (item.pack_rej || 0) + (item.media_rej || 0);
        return sum + rej;
    }, 0);
    const passedItems = Math.max(0, totalItems - totalRejections);
    const yieldRate = totalItems > 0 ? ((passedItems / totalItems) * 100).toFixed(1) : "0.0";

    // Box styling
    doc.setFillColor(245, 247, 250); // Light Grey/Blue background
    doc.setDrawColor(220, 220, 220);
    doc.rect(15, summaryY, pageWidth - 30, boxHeight, 'FD');

    // Summary Text
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("TOTAL ITEMS", 30, summaryY + 8);
    doc.text("PASSED", 80, summaryY + 8);
    doc.text("REJECTED", 130, summaryY + 8);
    doc.text("QUALITY SCORE", 170, summaryY + 8); // Slightly left to align

    doc.setFontSize(14);
    doc.setTextColor(50, 50, 50);
    doc.setFont(undefined, 'bold');
    doc.text(totalItems.toString(), 30, summaryY + 18);

    doc.setTextColor(39, 174, 96); // Green
    doc.text(passedItems.toFixed(0), 80, summaryY + 18);

    doc.setTextColor(192, 57, 43); // Red
    doc.text(totalRejections.toFixed(0), 130, summaryY + 18);

    // Yield Color
    if (parseFloat(yieldRate) >= 98) doc.setTextColor(39, 174, 96); // Green
    else if (parseFloat(yieldRate) >= 90) doc.setTextColor(243, 156, 18); // Orange
    else doc.setTextColor(192, 57, 43); // Red

    doc.text(`${yieldRate}%`, 170, summaryY + 18);
    doc.setFont(undefined, 'normal');

    // --- Main Data Table ---
    const tableY = summaryY + boxHeight + 15;

    const tableRows = lineItems.map(item => {
        const itemRej = (item.design_rej || 0) + (item.print_rej || 0) + (item.lam_rej || 0) +
            (item.cut_rej || 0) + (item.pack_rej || 0) + (item.media_rej || 0);
        const status = itemRej === 0 ? "PASS" : "FAIL";
        const notes = item.reason || (itemRej > 0 ? `${itemRej} Rej` : '');

        return [
            item.product || 'Unknown',
            `${item.print_media || '-'} \n+ ${item.lamination || '-'}`,
            item.batch_qty || 0,
            status,
            notes
        ];
    });

    autoTable(doc, {
        startY: tableY,
        head: [['Item Name', 'Media / Process', 'Qty', 'Status', 'Notes']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [44, 62, 80], textColor: 255 },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
            0: { cellWidth: 50 },
            1: { cellWidth: 60 },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
            4: { cellWidth: 'auto' }
        },
        didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 3) {
                if (data.cell.raw === 'PASS') data.cell.styles.textColor = [39, 174, 96];
                else data.cell.styles.textColor = [192, 57, 43];
            }
        }
    });

    // --- Visual Evidence Section ---
    // If there are input images, we try to add them. 
    // Caveat: Adding images from URL requires fetching as Blob/Base64 which might have CORS issues in browser.
    // For now, we will add a placeholder note or try to load if they are data URLs.

    let currentY = doc.lastAutoTable.finalY + 15;

    // Filter items with images
    const itemsWithImages = lineItems.filter(item => {
        // Check if item.images object has any non-empty arrays
        if (!item.images) return false;
        return Object.values(item.images).some(arr => arr && arr.length > 0);
    });

    if (itemsWithImages.length > 0) {
        // Check for page break
        if (currentY > pageWidth - 50) {
            doc.addPage();
            currentY = 20;
        }

        doc.setFontSize(12);
        doc.setTextColor(50, 50, 50);
        doc.text("Defect Visual Evidence", 15, currentY);
        currentY += 10;

        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text("Note: Images are linked in the digital report. (Embedded images coming soon)", 15, currentY);
        // NOTE: Actual image embedding requires complex async fetching of blobs which is unstable in pure frontend without proxy.
        // For MVP, we list them or leave a placeholder.
    }

    // --- Footer ---
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Generated by IDE Autoworks Quality Pulse - Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });
    }

    // Save
    const filename = `QC_Report_${entry.client_name}_${entry.project_name}_${today}.pdf`.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(filename);
}
