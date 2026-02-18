import { useState, useEffect } from 'react';
import { saveRejectionEntry } from '../services/supabase';
import { fetchProjectsForClient, appendRejectionToSheet } from '../services/googleSheets';
import { uploadFile } from '../services/googleDrive';
import { getTodayDate, calculateRejectionRate, strictTruncate } from '../utils/helpers';
import './ProductionEntry.css';

export default function ProductionEntry({ clients, mediaOptions, onSaved, showToast, prefillData }) {
    const [date, setDate] = useState(getTodayDate());
    const [clientName, setClientName] = useState('');
    const [vertical, setVertical] = useState('');
    const [projectName, setProjectName] = useState('');
    const [printerModel, setPrinterModel] = useState('');
    const [projects, setProjects] = useState([]);
    const [lineItems, setLineItems] = useState([]);
    const [loading, setLoading] = useState(false);

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

                // Load line items
                loadLineItems();
            }
        } else {
            setLineItems([]);
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
        const remaining = Math.max(0, masterQty - delivered);

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

        setLoading(true);
        try {
            // Save each line item
            for (const item of lineItems) {
                if (!item.product || !item.batchQty) continue;

                const metrics = calculateLineItemMetrics(item);

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
                    reason: item.reason || ''
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
                        const path = [...folderPath, categoryMap[key]];
                        const links = [];
                        for (const file of files) {
                            const link = await uploadFile(file, path);
                            links.push(link);
                        }
                        imageUrls[key] = links.join(', ');
                    }
                }

                // Save to Supabase
                const savedEntry = await saveRejectionEntry(entry);

                // Append to Google Sheet (with printer and images)
                await appendRejectionToSheet({
                    ...savedEntry,
                    printer_model: printerModel,
                    images: imageUrls
                });
            }

            // Reset form
            setClientName('');
            setProjectName('');
            setVertical('');
            setLineItems([]);
            setDate(getTodayDate());

            onSaved();
        } catch (error) {
            console.error('Error saving entry:', error);
            showToast('Error saving entry. Please try again.');
        } finally {
            setLoading(false);
        }
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
                            {projects.map((p, idx) => (
                                <option key={idx} value={p.project} />
                            ))}
                        </datalist>
                    </div>

                    <div className="form-field">
                        <label>Printer Model</label>
                        <input
                            type="text"
                            list="printer-list"
                            value={printerModel}
                            onChange={(e) => setPrinterModel(e.target.value)}
                            placeholder="Select Printer"
                        />
                        {mediaOptions && (
                            <datalist id="printer-list">
                                {mediaOptions.printers.map((p, idx) => (
                                    <option key={idx} value={p} />
                                ))}
                            </datalist>
                        )}
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
                        disabled={loading || lineItems.length === 0}
                    >
                        {loading ? 'Saving...' : 'Save Entry'}
                    </button>
                </div>
            </div>
        </section>
    );
}

function LineItemCard({ item, index, metrics, mediaOptions, onUpdate, onRemove }) {
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
                        list="print-media-list"
                        value={item.printMedia}
                        onChange={(e) => onUpdate(item.id, 'printMedia', e.target.value)}
                    />
                    {mediaOptions && (
                        <datalist id="print-media-list">
                            {mediaOptions.printMedia.map((m, idx) => (
                                <option key={idx} value={m} />
                            ))}
                        </datalist>
                    )}
                </div>

                <div className="form-field">
                    <label>Lamination</label>
                    <input
                        type="text"
                        list="lam-media-list"
                        value={item.lamMedia}
                        onChange={(e) => onUpdate(item.id, 'lamMedia', e.target.value)}
                    />
                    {mediaOptions && (
                        <datalist id="lam-media-list">
                            {mediaOptions.lamMedia.map((m, idx) => (
                                <option key={idx} value={m} />
                            ))}
                        </datalist>
                    )}
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
                    <span className="metric-inline-value">{Math.max(0, metrics.remaining).toFixed(2)}</span>
                </div>
                {metrics.remaining < 0 && (
                    <div className="metric-inline">
                        <span className="metric-inline-label">In Stock:</span>
                        <span className="metric-inline-value text-green">{Math.abs(metrics.remaining).toFixed(2)}</span>
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
