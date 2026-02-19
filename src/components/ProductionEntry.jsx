import { useState, useEffect } from 'react';
import { saveRejectionEntry, fetchMasters } from '../services/supabase';
import { fetchProjectsForClient, appendRejectionToSheet, fetchProjectDeliveredStats } from '../services/googleSheets';
import { uploadFile } from '../services/googleDrive';
import { getTodayDate, calculateRejectionRate, strictTruncate } from '../utils/helpers';
import Skeleton from './Skeleton';
import './ProductionEntry.css';

export default function ProductionEntry({ clients, mediaOptions, onSaved, showToast, prefillData, loading }) {
    const [date, setDate] = useState(getTodayDate());
    const [clientName, setClientName] = useState('');
    const [vertical, setVertical] = useState('');
    const [projectName, setProjectName] = useState('');
    const [printerModel, setPrinterModel] = useState('');
    const [projects, setProjects] = useState([]);
    const [lineItems, setLineItems] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    const [globalDeliveredStats, setGlobalDeliveredStats] = useState({});
    const [supabaseMasters, setSupabaseMasters] = useState({ printMedia: [], lamMedia: [], printers: [] });
    const [mergedOptions, setMergedOptions] = useState({ printMedia: [], lamMedia: [], printers: [] });

    // Fetch Supabase masters on mount
    useEffect(() => {
        async function load() {
            const data = await fetchMasters();
            setSupabaseMasters(data);
        }
        load();
    }, []);

    // Merge and Sort (Sticky) Options
    useEffect(() => {
        function getStickyList(sheetArr, dbArr, storageKey) {
            const combined = [...new Set([...(sheetArr || []), ...(dbArr || [])])].filter(Boolean).sort();
            const lastUsed = localStorage.getItem(storageKey);

            if (lastUsed && combined.includes(lastUsed)) {
                return [lastUsed, ...combined.filter(i => i !== lastUsed)];
            }
            return combined;
        }

        const sheetOps = mediaOptions || { printMedia: [], lamMedia: [], printers: [] };

        const newOptions = {
            printMedia: getStickyList(sheetOps.printMedia, supabaseMasters.printMedia, 'last_used_print_media'),
            lamMedia: getStickyList(sheetOps.lamMedia, supabaseMasters.lamMedia, 'last_used_lam_media'),
            printers: getStickyList(sheetOps.printers, supabaseMasters.printers, 'last_used_printer')
        };

        console.log('Merged Options:', newOptions);
        setMergedOptions(newOptions);
    }, [mediaOptions, supabaseMasters, printerModel, lineItems]); // Re-calc when deps change or when selection changes (to update sticky)

    // Helper to update sticky pref on selection
    const recordSelection = (key, value) => {
        if (value) localStorage.setItem(key, value);
    };

    // Handle pre-fill data from Pending Production
    useEffect(() => {
        if (prefillData) {
            setClientName(prefillData.client);
            setProjectName(prefillData.project);
        }
    }, [prefillData]);

    // Load projects when client changes
    useEffect(() => {
        if (clientName) {
            loadProjects();
            // Auto-fill vertical from clients list
            const client = clients.find(c => c.name === clientName);
            if (client) {
                setVertical(client.vertical);
            }
        } else {
            setProjects([]);
            setVertical('');
        }
    }, [clientName, clients]);

    // Load line items and details when project changes
    useEffect(() => {
        if (projectName && projects.length > 0) {
            const projectData = projects.find(p => p.project === projectName);
            if (projectData) {
                // Auto-fill details from project data
                if (projectData.vertical) setVertical(projectData.vertical);
                if (projectData.printerModel) setPrinterModel(projectData.printerModel);

                // Load Global Stats
                loadGlobalStats();

                // Load line items
                loadLineItems();
            }
        } else {
            setLineItems([]);
            setGlobalDeliveredStats({});
        }
    }, [projectName, projects]);

    async function loadProjects() {
        try {
            const data = await fetchProjectsForClient(clientName);
            setProjects(data);
        } catch (error) {
            console.error('Error loading projects:', error);
        }
    }

    async function loadGlobalStats() {
        try {
            const stats = await fetchProjectDeliveredStats(clientName, projectName);
            setGlobalDeliveredStats(stats);
        } catch (error) {
            console.error('Error fetching global stats:', error);
        }
    }

    function loadLineItems() {
        const projectData = projects.filter(p => p.project === projectName);
        if (projectData.length > 0) {
            const items = projectData.map((p, idx) => ({
                id: idx,
                product: p.product || '',
                printMedia: p.printMedia || '',
                lamMedia: p.lamMedia || '',
                size: p.size || '',
                masterQty: p.masterQty || 0,
                batchQty: 0,
                designRej: 0,
                printRej: 0,
                lamRej: 0,
                cutRej: 0,
                packRej: 0,
                mediaRej: 0,
                reason: '',
                images: {
                    design: [],
                    print: [],
                    lamination: [],
                    cut: [],
                    packaging: [],
                    media: []
                }
            }));
            setLineItems(items);
        }
    }

    function updateLineItem(id, field, value) {
        if (field === 'printMedia') recordSelection('last_used_print_media', value);
        if (field === 'lamMedia') recordSelection('last_used_lam_media', value);

        setLineItems(items => items.map(item => {
            if (item.id === id) {
                if (field.startsWith('image_')) {
                    const category = field.replace('image_', '');
                    return { ...item, images: { ...item.images, [category]: value } };
                }
                return { ...item, [field]: value };
            }
            return item;
        }));
    }

    function addLineItem() {
        const newItem = {
            id: Date.now(),
            product: '',
            printMedia: '',
            lamMedia: '',
            size: '',
            masterQty: 0,
            batchQty: 0,
            designRej: 0,
            printRej: 0,
            lamRej: 0,
            cutRej: 0,
            packRej: 0,
            mediaRej: 0,
            reason: '',
            images: {
                design: [],
                print: [],
                lamination: [],
                cut: [],
                packaging: [],
                media: []
            }
        };
        setLineItems([...lineItems, newItem]);
    }

    function removeLineItem(id) {
        setLineItems(items => items.filter(item => item.id !== id));
    }

    function calculateLineItemMetrics(item) {
        const totalRej =
            (parseFloat(item.designRej) || 0) +
            (parseFloat(item.printRej) || 0) +
            (parseFloat(item.lamRej) || 0) +
            (parseFloat(item.cutRej) || 0) +
            (parseFloat(item.packRej) || 0) +
            (parseFloat(item.mediaRej) || 0);

        const masterQty = parseFloat(item.masterQty) || 0;
        const batchQty = parseFloat(item.batchQty) || 0;
        const denominator = masterQty || batchQty;
        const rejectionPercent = calculateRejectionRate(totalRej, denominator);
        const delivered = (batchQty || 0) - totalRej;
        const inStock = Math.max(0, delivered - masterQty);

        // Global logic
        // Trim product name to match keys in stats map (case-insensitive)
        const globalDelivered = globalDeliveredStats[item.product.trim().toLowerCase()] || 0;
        const remaining = masterQty - (globalDelivered + delivered);

        return { totalRej, rejectionPercent, delivered, remaining, inStock };
    }

    async function handleSave() {
        // Validation
        if (!clientName || !projectName || lineItems.length === 0) {
            showToast('Please fill in client, project, and at least one line item');
            return;
        }

        // Check for batch > master without rejections
        for (const item of lineItems) {
            const metrics = calculateLineItemMetrics(item);
            if (metrics.inStock > 0 && metrics.totalRej === 0) {
                const confirmed = window.confirm(
                    `Item "${item.product}" has Batch Qty (${item.batchQty}) greater than Master Qty (${item.masterQty}) but no rejections are marked. The extra ${metrics.inStock} will be stored as In Stock. Proceed?`
                );
                if (!confirmed) return;
            }
        }

        setIsSaving(true);
        try {
            // Save each line item
            for (const item of lineItems) {
                if (!item.product || !item.batchQty) continue;

                const metrics = calculateLineItemMetrics(item);

                // Explicitly construct the full entry object with all derived metrics
                // This ensures we have all data even if Supabase doesn't return it due to RLS
                const entry = {
                    date: date,
                    client_name: clientName,
                    vertical: vertical,
                    project_name: projectName,
                    printer_model: printerModel,
                    product: item.product,
                    print_media: item.printMedia,
                    lamination: item.lamMedia,
                    size: item.size,
                    master_qty: parseFloat(item.masterQty) || 0,
                    batch_qty: parseFloat(item.batchQty) || 0,
                    design_rej: parseFloat(item.designRej) || 0,
                    print_rej: parseFloat(item.printRej) || 0,
                    lam_rej: parseFloat(item.lamRej) || 0,
                    cut_rej: parseFloat(item.cutRej) || 0,
                    pack_rej: parseFloat(item.packRej) || 0,
                    media_rej: parseFloat(item.mediaRej) || 0,
                    reason: item.reason || '',
                    // Derived metrics
                    qty_rejected: strictTruncate(metrics.totalRej),
                    qty_delivered: strictTruncate(metrics.delivered),
                    rejection_percent: metrics.rejectionPercent,
                    in_stock: strictTruncate(metrics.inStock)
                };

                // Upload images to Drive
                const imageUrls = {};
                const folderPath = [date, projectName, item.product];
                const categoryMap = {
                    design: 'Design File Rejection',
                    print: 'Printing Rejection',
                    lamination: 'Lamination Rejection',
                    cut: 'Cut Rejection',
                    packaging: 'Packaging Rejection',
                    media: 'Media Rejection'
                };

                for (const [key, files] of Object.entries(item.images)) {
                    if (files && files.length > 0) {
                        try {
                            const path = [...folderPath, categoryMap[key]];
                            const links = [];
                            for (const file of files) {
                                const link = await uploadFile(file, path);
                                links.push(link);
                            }
                            imageUrls[key] = links.join(', ');
                        } catch (imgError) {
                            console.error(`Error uploading ${key} images:`, imgError);
                            // Continue without failing the whole save
                        }
                    }
                }

                // 1. Save to Supabase
                try {
                    await saveRejectionEntry(entry);
                } catch (dbError) {
                    console.error('Supabase save failed:', dbError);
                    // Decide if we should continue or throw. 
                    // For now, log but proceed to Sheet if possible, or throw to stop?
                    // Usually database is source of truth, so we should probably throw or alert.
                    // But user specifically wants Sheets to work even if DB has issues (like RLS).
                    // We'll treat them somewhat independently but alert on failure.
                    showToast('Warning: Database save failed, attempting Google Sheets backup...');
                }

                // 2. Append to Google Sheet (using our local complete entry object)
                try {
                    await appendRejectionToSheet({
                        ...entry,
                        printer_model: printerModel,
                        images: imageUrls
                    });
                } catch (sheetError) {
                    console.error('Google Sheet save failed:', sheetError);
                    showToast('Warning: Google Sheet save failed');
                }
            }

            // Reset form
            setClientName('');
            setProjectName('');
            setVertical('');
            setLineItems([]);
            setDate(getTodayDate());

            onSaved();


            // Calculate overall project completion
            // Calculate overall project completion

            // Note: This is an approximation since we don't hold the full project context in state easily here
            // But usually users enter data for the remaining items.
            // A better check:
            const isFullyDelivered = lineItems.every(item => {
                const metrics = calculateLineItemMetrics(item);
                return metrics.remaining <= 0;
            });

            if (isFullyDelivered) {
                showToast(`Project "${projectName}" Completed! 🚀`, 5000);
            } else {
                showToast('Entry saved successfully!');
            }
        } catch (error) {
            console.error('Error saving entry:', error);
            showToast('Error saving entry. Please check console for details.');
        } finally {
            setIsSaving(false);
        }
    }

    // Loading Skeleton
    if (loading) {
        return (
            <section className="card">
                <div className="card-header">
                    <h2>New Production Entry</h2>
                    <div className="card-subtitle">Log rejected items</div>
                </div>
                <div className="card-body">
                    <div className="form-grid">
                        <div className="form-group">
                            <label>Date</label>
                            <Skeleton type="rect" width="100%" height="40px" />
                        </div>
                        <div className="form-group">
                            <label>Client Name</label>
                            <Skeleton type="rect" width="100%" height="40px" />
                        </div>
                        <div className="form-group">
                            <label>Project Name</label>
                            <Skeleton type="rect" width="100%" height="40px" />
                        </div>
                        <div className="form-group">
                            <label>Vertical</label>
                            <Skeleton type="rect" width="100%" height="40px" />
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="card">
            <div className="card-header">
                <h2>New Production Entry</h2>
                <div className="card-subtitle">Log rejection data for production runs</div>
            </div>
            <div className="card-body">
                <div className="form-grid">
                    <div className="form-field">
                        <label>Date</label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                        />
                    </div>

                    <div className="form-field">
                        <label>Client Name</label>
                        <input
                            type="text"
                            list="clients-list"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            placeholder="Type or select client"
                        />
                        <datalist id="clients-list">
                            {clients.map((c, idx) => (
                                <option key={idx} value={c.name} />
                            ))}
                        </datalist>
                    </div>

                    <div className="form-field">
                        <label>Vertical</label>
                        <input
                            type="text"
                            list="vertical-list"
                            value={vertical}
                            onChange={(e) => setVertical(e.target.value)}
                            placeholder="Select or type vertical"
                        />
                        <datalist id="vertical-list">
                            <option value="IDE Autoworks" />
                            <option value="IDE Commercial" />
                            <option value="Subumi" />
                        </datalist>
                    </div>

                    <div className="form-field">
                        <label>Project Name</label>
                        <input
                            type="text"
                            list="projects-list"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            placeholder="Type or select project"
                        />
                        <datalist id="projects-list">
                            {[...new Set(projects.map(p => p.project))].map((projectName, idx) => (
                                <option key={idx} value={projectName} />
                            ))}
                        </datalist>
                    </div>

                    <div className="form-field">
                        <label>Printer Model</label>
                        <input
                            type="text"
                            list="master-printer-list"
                            value={printerModel}
                            onChange={(e) => {
                                setPrinterModel(e.target.value);
                                recordSelection('last_used_printer', e.target.value);
                            }}
                            placeholder="Select Printer"
                        />
                    </div>
                </div>

                {lineItems.length > 0 && (
                    <div className="line-items-container">
                        {lineItems.map((item, idx) => {
                            const metrics = calculateLineItemMetrics(item);
                            return (
                                <LineItemCard
                                    key={item.id}
                                    item={item}
                                    index={idx}
                                    metrics={metrics}
                                    mediaOptions={mediaOptions}
                                    onUpdate={updateLineItem}
                                    onRemove={removeLineItem}
                                />
                            );
                        })}
                    </div>
                )}

                <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
                    <button className="primary-btn" onClick={addLineItem}>
                        + Add Line Item
                    </button>
                    <button
                        className="primary-btn"
                        onClick={handleSave}
                        disabled={isSaving || lineItems.length === 0}
                    >
                        {isSaving ? 'Saving...' : 'Save Entry'}
                    </button>
                </div>

                {/* Global Datalists for Sticky Selection */}
                <datalist id="master-print-media-list">
                    {mergedOptions.printMedia.map((m, idx) => <option key={idx} value={m} />)}
                </datalist>
                <datalist id="master-lam-media-list">
                    {mergedOptions.lamMedia.map((m, idx) => <option key={idx} value={m} />)}
                </datalist>
                <datalist id="master-printer-list">
                    {mergedOptions.printers.map((m, idx) => <option key={idx} value={m} />)}
                </datalist>
            </div>
        </section>
    );
}

function LineItemCard({ item, index, metrics, onUpdate, onRemove }) {
    return (
        <div className="line-item-card">
            <div className="line-item-header">
                <span>Line Item #{index + 1}</span>
                <button className="remove-btn" onClick={() => onRemove(item.id)}>×</button>
            </div>

            <div className="line-item-grid">
                <div className="form-field">
                    <label>Product / Panel</label>
                    <input
                        type="text"
                        value={item.product}
                        onChange={(e) => onUpdate(item.id, 'product', e.target.value)}
                        placeholder="Product name"
                    />
                </div>

                <div className="form-field">
                    <label>Print Media</label>
                    <input
                        type="text"
                        list="master-print-media-list"
                        value={item.printMedia}
                        onChange={(e) => onUpdate(item.id, 'printMedia', e.target.value)}
                    />
                </div>

                <div className="form-field">
                    <label>Lamination</label>
                    <input
                        type="text"
                        list="master-lam-media-list"
                        value={item.lamMedia}
                        onChange={(e) => onUpdate(item.id, 'lamMedia', e.target.value)}
                    />
                </div>

                <div className="form-field">
                    <label>Size</label>
                    <input
                        type="text"
                        value={item.size}
                        onChange={(e) => onUpdate(item.id, 'size', e.target.value)}
                    />
                </div>

                <div className="form-field">
                    <label>Master Qty</label>
                    <input
                        type="number"
                        min="0"
                        value={item.masterQty}
                        onChange={(e) => onUpdate(item.id, 'masterQty', e.target.value)}
                    />
                </div>

                <div className="form-field">
                    <label>Batch Qty</label>
                    <input
                        type="number"
                        min="0"
                        value={item.batchQty}
                        onChange={(e) => onUpdate(item.id, 'batchQty', e.target.value)}
                    />
                </div>
            </div>

            <div className="rejection-grid">
                <div className="form-field">
                    <label>Design Rej</label>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.designRej}
                        onChange={(e) => onUpdate(item.id, 'designRej', e.target.value)}
                    />
                </div>

                <div className="form-field">
                    <label>Print Rej</label>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.printRej}
                        onChange={(e) => onUpdate(item.id, 'printRej', e.target.value)}
                    />
                </div>

                <div className="form-field">
                    <label>Lam Rej</label>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.lamRej}
                        onChange={(e) => onUpdate(item.id, 'lamRej', e.target.value)}
                    />
                </div>

                <div className="form-field">
                    <label>Cut Rej</label>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.cutRej}
                        onChange={(e) => onUpdate(item.id, 'cutRej', e.target.value)}
                    />
                </div>

                <div className="form-field">
                    <label>Pack Rej</label>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.packRej}
                        onChange={(e) => onUpdate(item.id, 'packRej', e.target.value)}
                    />
                </div>

                <div className="form-field">
                    <label>Media Rej</label>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.mediaRej}
                        onChange={(e) => onUpdate(item.id, 'mediaRej', e.target.value)}
                    />
                </div>
            </div>

            <div className="image-upload-grid">
                <ImageUploadField
                    label="Design Img"
                    onChange={(files) => onUpdate(item.id, 'image_design', files)}
                    files={item.images?.design || []}
                />
                <ImageUploadField
                    label="Print Img"
                    onChange={(files) => onUpdate(item.id, 'image_print', files)}
                    files={item.images?.print || []}
                />
                <ImageUploadField
                    label="Lam Img"
                    onChange={(files) => onUpdate(item.id, 'image_lamination', files)}
                    files={item.images?.lamination || []}
                />
                <ImageUploadField
                    label="Cut Img"
                    onChange={(files) => onUpdate(item.id, 'image_cut', files)}
                    files={item.images?.cut || []}
                />
                <ImageUploadField
                    label="Pack Img"
                    onChange={(files) => onUpdate(item.id, 'image_packaging', files)}
                    files={item.images?.packaging || []}
                />
                <ImageUploadField
                    label="Media Img"
                    onChange={(files) => onUpdate(item.id, 'image_media', files)}
                    files={item.images?.media || []}
                />
            </div>

            <div className="metrics-row-inline">
                <div className="metric-inline">
                    <span className="metric-inline-label">Total Rejected:</span>
                    <span className="metric-inline-value">{metrics.totalRej.toFixed(2)}</span>
                </div>
                <div className="metric-inline">
                    <span className="metric-inline-label">Rejection %:</span>
                    <span className={`metric-inline-value ${metrics.rejectionPercent > 3 ? 'text-red' : ''}`}>
                        {metrics.rejectionPercent.toFixed(2)}%
                    </span>
                </div>
                <div className="metric-inline">
                    <span className="metric-inline-label">Remaining:</span>
                    {/* Green if <= 0 (all delivered), Red if > 0 (still pending) */}
                    <span className={`metric-inline-value ${metrics.remaining <= 0 ? 'text-green' : 'text-red'}`}>
                        {Math.max(0, metrics.remaining).toFixed(2)}
                    </span>
                </div>
                {metrics.inStock > 0 && (
                    <div className="metric-inline">
                        <span className="metric-inline-label">In Stock:</span>
                        <span className="metric-inline-value text-green">{metrics.inStock.toFixed(2)}</span>
                    </div>
                )}
            </div>

            <div className="form-field">
                <label>Reason / Comments</label>
                <textarea
                    value={item.reason}
                    onChange={(e) => onUpdate(item.id, 'reason', e.target.value)}
                    placeholder="Optional comments"
                />
            </div>
        </div>
    );
}

function ImageUploadField({ label, onChange, files }) {
    const fileCount = files.length;

    return (
        <div className="image-upload-field">
            <span className="image-label">{label}</span>
            <label className="upload-icon-btn">
                <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => onChange(Array.from(e.target.files))}
                    style={{ display: 'none' }}
                />
                <span className={`icon ${fileCount > 0 ? 'has-file' : ''}`}>
                    {fileCount > 0 ? '✓' : '+'}
                </span>
            </label>
            {fileCount > 0 && <div className="file-name-preview">{fileCount} {fileCount === 1 ? 'file' : 'files'}</div>}
        </div>
    );
}
