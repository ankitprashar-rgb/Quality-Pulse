import React, { useState, useEffect } from 'react';
import { fetchRejectionLogs, updateRejectionEntry, deleteRejectionEntry } from '../services/supabase';
import { formatPercent, formatNum, formatDate, generateExcelFilename } from '../utils/helpers';
import * as XLSX from 'xlsx';
import { generateQualityReport } from '../services/pdfGenerator';
import Skeleton from './Skeleton';
import './ClientExplorer.css';

/** Consolidate logs by client+project */
function consolidate(logs) {
    const projectMap = new Map();
    const productMasterMap = new Map(); // Key: client|||project|||product

    for (const row of logs) {
        const pKey = `${(row.client_name || '').trim()}|||${(row.project_name || '').trim()}`;
        const prodKey = `${pKey}|||${(row.product || '').trim()}`;

        // Track master_qty once per unique product in this project
        if (!productMasterMap.has(prodKey)) {
            productMasterMap.set(prodKey, Number(row.master_qty) || 0);
        }

        if (!projectMap.has(pKey)) {
            projectMap.set(pKey, {
                client_name: row.client_name, project_name: row.project_name,
                vertical: row.vertical, master_qty: 0,
                qty_rejected: 0, qty_delivered: 0,
                design_rej: 0, print_rej: 0, lam_rej: 0,
                cut_rej: 0, pack_rej: 0, media_rej: 0, entries: 0,
                rawRows: [],
            });
        }
        const g = projectMap.get(pKey);
        g.qty_rejected += Number(row.qty_rejected) || 0;
        g.qty_delivered += Number(row.qty_delivered) || 0;
        g.design_rej += Number(row.design_rej) || 0;
        g.print_rej += Number(row.print_rej) || 0;
        g.lam_rej += Number(row.lam_rej) || 0;
        g.cut_rej += Number(row.cut_rej) || 0;
        g.pack_rej += Number(row.pack_rej) || 0;
        g.media_rej += Number(row.media_rej) || 0;
        g.entries += 1;
        g.rawRows.push(row);
    }

    // Accumulate unique product master quantities into project totals
    for (const [prodKey, mQty] of productMasterMap.entries()) {
        const pKey = prodKey.split('|||').slice(0, 2).join('|||');
        if (projectMap.has(pKey)) {
            projectMap.get(pKey).master_qty += mQty;
        }
    }

    return Array.from(projectMap.values()).map(g => {
        const denom = g.master_qty || 0;
        return {
            ...g,
            rejection_percent: denom > 0 ? (g.qty_rejected / denom) * 100 : 0,
            in_stock: Math.max(0, g.qty_delivered - denom),
        };
    }).sort((a, b) => {
        const clientCompare = (a.client_name || '').localeCompare(b.client_name || '');
        if (clientCompare !== 0) return clientCompare;
        return (a.project_name || '').localeCompare(b.project_name || '');
    });
}

/** Get date range helpers */
function getDateRange(view) {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    if (view === 'week') {
        const monday = new Date(today);
        monday.setDate(today.getDate() + mondayOffset);
        return { fromDate: monday.toISOString().split('T')[0] };
    }
    if (view === 'lastweek') {
        const monday = new Date(today);
        monday.setDate(today.getDate() + mondayOffset - 7);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { fromDate: monday.toISOString().split('T')[0], toDate: sunday.toISOString().split('T')[0] };
    }
    if (view === 'month') {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        return { fromDate: firstDay.toISOString().split('T')[0] };
    }
    // 'all' — no filters
    return {};
}

export default function ClientExplorer({ clients }) {
    const [view, setView] = useState('week'); // 'week' | 'lastweek' | 'month' | 'all'
    const [clientFilter, setClientFilter] = useState('');
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(new Set());
    const [editingId, setEditingId] = useState(null);
    const [editData, setEditData] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    useEffect(() => { loadData(); }, [view]);

    async function loadData() {
        setLoading(true);
        setExpanded(new Set());
        try {
            const filters = getDateRange(view);
            const data = await fetchRejectionLogs(filters);
            setLogs(data);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    }

    function toggleExpand(idx) {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    }

    function startEdit(row) { setEditingId(row.id); setEditData({ ...row }); }
    function cancelEdit() { setEditingId(null); setEditData(null); }
    function handleEditField(field, value) { setEditData(prev => ({ ...prev, [field]: Number(value) || 0 })); }

    async function saveEdit() {
        if (!editData || !editingId) return;
        try {
            await updateRejectionEntry(editingId, editData);
            await loadData();
            setEditingId(null); setEditData(null);
        } catch (error) { console.error('Error saving edit:', error); alert('Error saving changes.'); }
    }

    async function confirmDelete() {
        if (!deleteConfirm) return;
        try {
            if (Array.isArray(deleteConfirm)) {
                // Batch delete
                for (const id of deleteConfirm) {
                    await deleteRejectionEntry(id);
                }
            } else {
                // Single delete
                await deleteRejectionEntry(deleteConfirm);
            }
            await loadData();
            setDeleteConfirm(null);
        } catch (error) { console.error('Error deleting:', error); alert('Error deleting entry.'); }
    }


    function exportEntry(row) {
        const data = [{
            'Date': formatDate(row.date), 'Client': row.client_name, 'Project': row.project_name,
            'Vertical': row.vertical, 'Product': row.product,

            'Print Media': row.print_media, 'Lamination': row.lamination,
            'Printer': row.printer_model, 'Size': row.size,
            'Master Qty': row.master_qty, 'Batch Qty': row.batch_qty,
            'Delivered': row.qty_delivered, 'Rejected': row.qty_rejected,
            'Rejection %': row.rejection_percent,
            'Design': row.design_rej, 'Print': row.print_rej, 'Lam': row.lam_rej,
            'Cut': row.cut_rej, 'Pack': row.pack_rej, 'Media': row.media_rej,
            'Reason': row.reason,
        }];
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Entry');
        XLSX.writeFile(wb, `QP_${row.client_name}_${row.project_name}.xlsx`);
    }

    function handleExportExcel() {
        if (logs.length === 0) return;
        const exportData = logs.map(r => ({
            'Date': formatDate(r.date), 'Client': r.client_name, 'Project': r.project_name,
            'Vertical': r.vertical, 'Product': r.product,

            'Print Media': r.print_media, 'Lamination': r.lamination,
            'Printer': r.printer_model, 'Size': r.size,
            'Master Qty': r.master_qty, 'Batch Qty': r.batch_qty,
            'Qty Delivered': r.qty_delivered, 'Qty Rejected': r.qty_rejected,
            'Rejection %': r.rejection_percent,
            'Design Rej': r.design_rej, 'Print Rej': r.print_rej,
            'Lam Rej': r.lam_rej, 'Cut Rej': r.cut_rej,
            'Pack Rej': r.pack_rej, 'Media Rej': r.media_rej,
            'Reason': r.reason
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Quality Data');
        XLSX.utils.book_append_sheet(wb, ws, 'Quality Data');
        XLSX.writeFile(wb, generateExcelFilename(null, `Quality_${view}`));
    }

    const consolidated = consolidate(logs);
    const filtered = clientFilter
        ? consolidated.filter(p =>
            p.client_name.toLowerCase().includes(clientFilter.toLowerCase()) ||
            p.project_name.toLowerCase().includes(clientFilter.toLowerCase()))
        : consolidated;

    const tabs = [
        { key: 'week', label: 'This Week' },
        { key: 'lastweek', label: 'Last Week' },
        { key: 'month', label: 'This Month' },
        { key: 'all', label: 'All Time' },
    ];

    return (
        <section className="card">
            <div className="card-header">
                <h2>Client-wise Quality Explorer</h2>
            </div>
            <div className="card-body">
                <div className="explorer-toolbar">
                    <div className="explorer-tabs">
                        {tabs.map(t => (
                            <button
                                key={t.key}
                                className={`explorer-tab ${view === t.key ? 'active' : ''}`}
                                onClick={() => setView(t.key)}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <input
                        type="text"
                        className="explorer-search"
                        placeholder="Filter by client or project..."
                        value={clientFilter}
                        onChange={e => setClientFilter(e.target.value)}
                    />

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {logs.length > 0 && (
                            <button className="primary-btn export-btn" style={{ marginBottom: 0 }} onClick={handleExportExcel}>
                                Export Excel
                            </button>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="overview-table">
                        <table>
                            <thead>
                                <tr>
                                    <th className="th-icon"></th>
                                    <th>Client</th>
                                    <th>Project</th>
                                    <th>Vertical</th>
                                    <th>Master Qty</th>
                                    <th>Rejection %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[1, 2, 3, 4, 5].map(i => (
                                    <tr key={i} className="overview-row">
                                        <td><Skeleton type="circle" width="20px" height="20px" /></td>
                                        <td><Skeleton type="text" width="120px" /></td>
                                        <td><Skeleton type="text" width="150px" /></td>
                                        <td><Skeleton type="text" width="80px" /></td>
                                        <td><Skeleton type="text" width="60px" /></td>
                                        <td><Skeleton type="text" width="50px" /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                        {clientFilter ? 'No matching projects found.' : 'No entries found.'}
                    </div>
                ) : (
                    <>
                        <div style={{ fontSize: '12px', color: '#6b7280', margin: '8px 0' }}>
                            {filtered.length} projects from {logs.length} entries
                        </div>
                        <div className="overview-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th className="th-icon"></th>
                                        <th>Client</th>
                                        <th>Project</th>
                                        <th>Vertical</th>
                                        <th>Master Qty</th>
                                        <th>Rejection %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((p, idx) => (
                                        <React.Fragment key={idx}>
                                            <tr
                                                className={`overview-row ${expanded.has(idx) ? 'expanded' : ''}`}
                                                onClick={() => toggleExpand(idx)}
                                            >
                                                <td className="expand-icon">{expanded.has(idx) ? '▾' : '▸'}</td>
                                                <td className="col-bold">{p.client_name}</td>
                                                <td className="col-bold">
                                                    {p.project_name}
                                                    {p.entries > 1 && <span className="entry-count"> ({p.entries})</span>}
                                                </td>
                                                <td>{p.vertical}</td>
                                                <td>{formatNum(p.master_qty)}</td>
                                                <td className={`col-bold ${p.rejection_percent > 3 ? 'text-red' : ''}`}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        {formatPercent(p.rejection_percent)}
                                                        <button
                                                            className="icon-btn delete"
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                const ids = p.rawRows.map(r => r.id);
                                                                if (ids.length > 0) setDeleteConfirm(ids);
                                                            }}
                                                            title="Delete Entire Project"
                                                            style={{ width: '24px', height: '24px', padding: 0, marginLeft: '8px' }}
                                                        >
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {expanded.has(idx) && (
                                                <tr className="detail-row">
                                                    <td colSpan="6">
                                                        <div className="detail-panel">
                                                            {/* ── Entries FIRST ── */}
                                                            {p.rawRows.length > 0 && (
                                                                <div className="entry-list">
                                                                    <div className="entry-list-header">Entries</div>
                                                                    {p.rawRows.map(row => (
                                                                        <div key={row.id} className="entry-item">
                                                                            {editingId === row.id ? (
                                                                                <div className="entry-edit">
                                                                                    <div className="edit-fields">
                                                                                        {['batch_qty', 'master_qty', 'design_rej', 'print_rej', 'lam_rej', 'cut_rej', 'pack_rej', 'media_rej'].map(f => (
                                                                                            <div className="ef" key={f}>
                                                                                                <label>{f.replace('_rej', '').replace('_qty', '').replace('batch', 'Batch').replace('master', 'Master').replace('design', 'Design').replace('print', 'Print').replace('lam', 'Lam').replace('cut', 'Cut').replace('pack', 'Pack').replace('media', 'Media')}</label>
                                                                                                <input type="number" value={editData[f] || ''} onChange={e => handleEditField(f, e.target.value)} />
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                    <div className="edit-actions">
                                                                                        <button className="action-btn save" onClick={saveEdit} aria-label="Save">
                                                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                                                                        </button>
                                                                                        <button className="action-btn cancel" onClick={cancelEdit} aria-label="Cancel">
                                                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <>
                                                                                    <div className="entry-info">
                                                                                        <span className="ei-product">{row.product || 'No product'}</span>
                                                                                        <span className="ei-sep">·</span>
                                                                                        <span className="ei-media" title={row.print_media}>Print: {row.print_media || '-'}</span>
                                                                                        <span className="ei-sep">·</span>
                                                                                        <span className="ei-media" title={row.lamination}>Lam: {row.lamination || '-'}</span>
                                                                                        <span className="ei-sep">·</span>
                                                                                        <span className="ei-media">Printer: {row.printer_model || '-'}</span>
                                                                                        <span className="ei-sep">·</span>
                                                                                        <span className="ei-media">Size: {row.size || '-'}</span>
                                                                                        <span className="ei-sep">·</span>
                                                                                        <span className="ei-batch">Batch: {formatNum(row.batch_qty)}</span>
                                                                                        <span className="ei-sep">·</span>
                                                                                        <span className="ei-rej">Rej: {formatNum(row.qty_rejected)}</span>
                                                                                    </div>
                                                                                    <div className="entry-actions">
                                                                                        <button className="icon-btn edit" onClick={e => { e.stopPropagation(); startEdit(row); }} aria-label="Edit Entry">
                                                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                                                        </button>
                                                                                        <button className="icon-btn delete" onClick={e => {
                                                                                            e.stopPropagation();
                                                                                            if (row.id) setDeleteConfirm(row.id);
                                                                                            else console.error('Missing ID for delete');
                                                                                        }} aria-label="Delete Entry">
                                                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                                                                        </button>
                                                                                        <button className="icon-btn export" onClick={e => { e.stopPropagation(); exportEntry(row); }} aria-label="Export Excel">
                                                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                                                                        </button>
                                                                                        <button className="icon-btn export-pdf" onClick={e => { e.stopPropagation(); generateQualityReport(row, [row]); }} aria-label="Export QC Report">
                                                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                                                                        </button>
                                                                                    </div>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            <div className="summary-boxes">
                                                                <div className="summary-box">
                                                                    <span className="sb-label">Delivered Qty</span>
                                                                    <span className="sb-value">{formatNum(p.qty_delivered)}</span>
                                                                </div>
                                                                <div className="summary-box">
                                                                    <span className="sb-label">Qty Rejected</span>
                                                                    <span className="sb-value rej">{formatNum(p.qty_rejected)}</span>
                                                                </div>
                                                                <div className={`summary-box ${p.in_stock > 0 ? 'has-stock' : ''}`}>
                                                                    <span className="sb-label">Qty In Stock</span>
                                                                    <span className={`sb-value ${p.in_stock < 0 ? 'rej' : ''}`}>{formatNum(p.in_stock)}</span>
                                                                </div>
                                                                <div className="summary-box stage-box">
                                                                    <span className="sb-label">Design</span>
                                                                    <span className={`sb-value ${p.design_rej > 0 ? 'rej' : ''}`}>{formatNum(p.design_rej)}</span>
                                                                </div>
                                                                <div className="summary-box stage-box">
                                                                    <span className="sb-label">Print</span>
                                                                    <span className={`sb-value ${p.print_rej > 0 ? 'rej' : ''}`}>{formatNum(p.print_rej)}</span>
                                                                </div>
                                                                <div className="summary-box stage-box">
                                                                    <span className="sb-label">Lam</span>
                                                                    <span className={`sb-value ${p.lam_rej > 0 ? 'rej' : ''}`}>{formatNum(p.lam_rej)}</span>
                                                                </div>
                                                                <div className="summary-box stage-box">
                                                                    <span className="sb-label">Cut</span>
                                                                    <span className={`sb-value ${p.cut_rej > 0 ? 'rej' : ''}`}>{formatNum(p.cut_rej)}</span>
                                                                </div>
                                                                <div className="summary-box stage-box">
                                                                    <span className="sb-label">Pack</span>
                                                                    <span className={`sb-value ${p.pack_rej > 0 ? 'rej' : ''}`}>{formatNum(p.pack_rej)}</span>
                                                                </div>
                                                                <div className="summary-box stage-box">
                                                                    <span className="sb-label">Media</span>
                                                                    <span className={`sb-value ${p.media_rej > 0 ? 'rej' : ''}`}>{formatNum(p.media_rej)}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {deleteConfirm && (
                <div className="modal-overlay" style={{ zIndex: 99999 }} onClick={() => setDeleteConfirm(null)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-title">
                            {Array.isArray(deleteConfirm) ? 'Delete Entire Project?' : 'Delete Entry?'}
                        </div>
                        <p>
                            {Array.isArray(deleteConfirm)
                                ? `Are you sure you want to delete ALL ${deleteConfirm.length} entries for this project? This action cannot be undone.`
                                : 'Are you sure you want to delete this entry? This action cannot be undone.'
                            }
                        </p>
                        <div className="modal-actions">
                            <button className="action-btn cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                            <button
                                className="action-btn delete"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    confirmDelete();
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
