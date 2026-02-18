import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate } from '../utils/helpers';

/**
 * Generate and download a Quality Assurance Report PDF (IDE Style)
 * @param {Object} entry - The production entry object
 * @param {Array} lineItems - Array of individual line items
 */
export async function generateQualityReport(entry, lineItems) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const today = formatDate(new Date());

    // Brand Colors
    const BRAND_HIGHLIGHT = '#d4de47'; // Neon Green
    const BRAND_BLACK = '#111827';
    const BRAND_GREY = '#6b7280';

    // --- Helper for Text Color ---
    const setBlack = () => doc.setTextColor(17, 24, 39);
    const setGrey = () => doc.setTextColor(107, 114, 128);
    const setHighlight = () => doc.setTextColor(212, 222, 71);

    // --- Load Logo (Async with Dimensions) ---
    // We try to fetch the image to base64. If it fails, fallback to text.
    let logoData = null;
    let logoRatio = 4; // Default fallback (4:1)
    try {
        const logoUrl = "https://res.cloudinary.com/du5vwtwvr/image/upload/v1762093742/IDE_Black_igvryv.png";
        const response = await fetch(logoUrl);
        const blob = await response.blob();
        logoData = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });

        // Get dimensions
        const img = new Image();
        img.src = logoData;
        await new Promise(resolve => img.onload = resolve);
        if (img.height > 0) logoRatio = img.width / img.height;
    } catch (e) {
        console.warn("Could not load logo", e);
    }

    // --- Header ---
    const topMargin = 20;

    // Logo (Top Right)
    if (logoData) {
        // Fix width to 17mm (1/3rd of previous), calculate height based on ratio
        const logoW = 17;
        const logoH = logoW / logoRatio;
        doc.addImage(logoData, 'PNG', pageWidth - 20 - logoW, topMargin - 5, logoW, logoH);
    } else {
        doc.setFontSize(22);
        doc.setTextColor(BRAND_BLACK);
        doc.text("IDE Autoworks", pageWidth - 20, topMargin + 5, { align: 'right' });
    }

    // Title (Top Left)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    setBlack();
    doc.text("Quality Assurance Report", 20, topMargin + 5);

    // Meta Data Grid (Below Title)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setGrey();

    const metaY = topMargin + 20;
    const col1 = 20;
    const col2 = 80;

    doc.text("REPORT DATE", col1, metaY);
    doc.text("CLIENT", col1, metaY + 8);
    doc.text("PROJECT", col1, metaY + 16);

    doc.text("REPORT ID", col2, metaY);
    // Printer moved to table, so we remove it from here ideally, or keep as primary printer if needed. 
    // User asked to remove from top *if moved to table*. We will keep ID here.

    doc.setFont("helvetica", "bold");
    setBlack();
    doc.text(today, col1 + 25, metaY);
    doc.text(entry.client_name || '-', col1 + 25, metaY + 8);
    doc.text(entry.project_name || '-', col1 + 25, metaY + 16);

    doc.text(`QC-${today.replace(/-/g, '')}-${(entry.id || 'NEW').toString().slice(-4)}`, col2 + 20, metaY);

    // --- Executive Summary (Pulse Box) ---
    const summaryY = metaY + 28;
    const boxHeight = 28;

    // Metrics
    const totalItems = lineItems.reduce((sum, item) => sum + (parseFloat(item.batch_qty) || 0), 0);
    const totalRejections = lineItems.reduce((sum, item) => {
        return sum + (item.design_rej || 0) + (item.print_rej || 0) + (item.lam_rej || 0) +
            (item.cut_rej || 0) + (item.pack_rej || 0) + (item.media_rej || 0);
    }, 0);
    const passedItems = Math.max(0, totalItems - totalRejections);
    const yieldRate = totalItems > 0 ? ((passedItems / totalItems) * 100).toFixed(1) : "0.0";

    // Draw Box
    doc.setDrawColor(229, 231, 235); // Light grey border
    doc.setFillColor(252, 252, 252); // Very light grey bg
    doc.roundedRect(20, summaryY, pageWidth - 40, boxHeight, 3, 3, 'FD');

    // Box Content
    const kpiY = summaryY + 8;
    const valY = summaryY + 19;

    // Helper to draw KPI
    const drawKpi = (label, value, x, type = 'normal') => {
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        setGrey();
        doc.text(label, x, kpiY);

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        if (type === 'good') doc.setTextColor(39, 174, 96);
        else if (type === 'bad') doc.setTextColor(220, 38, 38);
        else if (type === 'highlight') doc.setTextColor(200, 150, 0); // Gold-ish for score logic handles text color below
        else setBlack();

        doc.text(value, x, valY);
    };

    drawKpi("TOTAL ITEMS", totalItems.toString(), 35);
    drawKpi("PASSED", passedItems.toFixed(0), 85, 'good');
    drawKpi("REJECTED", totalRejections.toFixed(0), 135, 'bad');

    // Quality Score (Custom Logic for coloring/position)
    doc.setFontSize(8);
    setGrey();
    const scoreX = 160; // Moved left to fit 94.5%
    doc.text("QUALITY SCORE", scoreX, kpiY);
    doc.setFontSize(14);

    if (parseFloat(yieldRate) >= 98) doc.setTextColor(39, 174, 96);
    else if (parseFloat(yieldRate) >= 90) doc.setTextColor(245, 158, 11);
    else doc.setTextColor(220, 38, 38);

    doc.text(`${yieldRate}%`, scoreX, valY);


    // --- Comparison Table ---
    const tableY = summaryY + boxHeight + 20;

    // We need to flatten the data for the table
    // Row 1: Item | Media Config | Printer
    // Row 2: Rejection Stats
    const tableBody = [];

    lineItems.forEach(item => {
        // Main Row
        const mediaConfig = `${item.print_media || '-'} \n+ ${item.lamination || '-'}`;
        tableBody.push([
            { content: item.product || 'Unknown', styles: { fontStyle: 'bold', textColor: [17, 24, 39] } },
            { content: mediaConfig },
            { content: item.printer_model || '-' }
            // Qty and Status removed from columns per request? 
            // User said: "Item Name | Media Configuration | Printer (*remove if from the top...)"
            // User also said "Remove Status and Fail"
            // Wait, Qty is essential. Providing: Item Name | Media | Printer | Qty
        ]);

        // Detail Row (KPI Cards)
        // We construct a visual string or just leave empty and use hooks to draw.
        // Using hooks is better for "KPI card format". 
        // We push a row that spans all columns.
        tableBody.push([
            { content: '', colSpan: 3, styles: { minCellHeight: 18 } } // Placeholder for custom draw
        ]);
    });

    autoTable(doc, {
        startY: tableY,
        head: [['Item / Product', 'Media Configuration', 'Printer']], // Adjusted columns
        body: tableBody,
        theme: 'plain',
        styles: {
            font: 'helvetica',
            fontSize: 10,
            cellPadding: 4,
            lineColor: [229, 231, 235],
            lineWidth: { bottom: 0.5 }
        },
        headStyles: {
            fillColor: [212, 222, 71], // #d4de47 Neon Green Header
            textColor: [17, 24, 39],   // Black Text
            fontStyle: 'bold',
            textTransform: 'uppercase'
        },
        columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 70 },
            2: { cellWidth: 'auto' }
        },
        // Hook to draw the "KPI Cards" in the 2nd row of each pair
        didDrawCell: function (data) {
            if (data.section === 'body' && data.row.index % 2 !== 0 && data.column.index === 0) {
                // This is the Detail Row (odd index in 0-based body, spread across 3 cols)
                // We need the data from the source lineItems. 
                // data.row.index corresponds to table row. 
                // itemIndex = (data.row.index - 1) / 2? No.
                // 2 rows per item. itemIndex = Math.floor(data.row.index / 2)
                const itemIndex = Math.floor(data.row.index / 2);
                const item = lineItems[itemIndex];

                const stats = [
                    { label: 'Design', val: item.design_rej },
                    { label: 'Print', val: item.print_rej },
                    { label: 'Lamination', val: item.lam_rej },
                    { label: 'Cutting', val: item.cut_rej },
                    { label: 'Packing', val: item.pack_rej },
                    { label: 'Media', val: item.media_rej }
                ];

                let outputX = data.cell.x + 2;
                const outputY = data.cell.y + 2;
                const cardWidth = 24;
                const cardHeight = 14;
                const gap = 4;

                // Draw "Rejections Breakdown" label small?
                doc.setFontSize(7);
                doc.setTextColor(150);
                doc.text("REJECTIONS:", outputX, outputY + 8);
                outputX += 20;

                stats.forEach(stat => {
                    // Only show if value > 0 or always show? User said "Second row should just show... Rejections for each stage"
                    // "Nice small KPI card formats".

                    const isRej = (stat.val || 0) > 0;

                    // Card Bg
                    if (isRej) {
                        doc.setFillColor(254, 242, 242); // Red tint
                        doc.setDrawColor(252, 165, 165); // Red border
                    } else {
                        doc.setFillColor(249, 250, 251); // Grey tint
                        doc.setDrawColor(229, 231, 235); // Grey border
                    }
                    doc.roundedRect(outputX, outputY, cardWidth, cardHeight, 2, 2, 'FD');

                    // Label
                    doc.setFontSize(6);
                    doc.setTextColor(107, 114, 128); // Grey
                    doc.text(stat.label, outputX + (cardWidth / 2), outputY + 5, { align: 'center' });

                    // Value
                    doc.setFontSize(9);
                    doc.setFont("helvetica", "bold");
                    if (isRej) doc.setTextColor(220, 38, 38); // Red
                    else doc.setTextColor(17, 24, 39); // Black
                    doc.text((stat.val || 0).toString(), outputX + (cardWidth / 2), outputY + 11, { align: 'center' });

                    outputX += cardWidth + gap;
                });
            }
        }
    });

    // --- Signature Placeholder ---
    const bottomY = pageHeight - 40;
    doc.setDrawColor(156, 163, 175); // Grey line
    doc.setLineWidth(0.5);
    doc.line(pageWidth - 70, bottomY, pageWidth - 20, bottomY); // Line

    doc.setFontSize(10);
    setBlack();
    doc.text("Quality Head", pageWidth - 45, bottomY + 5, { align: 'center' });
    doc.setFontSize(8);
    setGrey();
    doc.text("Authorized Signature", pageWidth - 45, bottomY + 9, { align: 'center' });

    // Save
    const filename = `QC_Report_${entry.client_name}_${entry.project_name}_${today}.pdf`.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(filename);
}
