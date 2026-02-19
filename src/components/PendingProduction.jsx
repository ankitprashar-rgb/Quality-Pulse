import { useState, useEffect } from 'react';
import { fetchAllProjects } from '../services/googleSheets';
import { fetchRejectionLogs } from '../services/supabase';
import { formatDate } from '../utils/helpers';
import Skeleton from './Skeleton';
import './PendingProduction.css';

export default function PendingProduction({ onSelectProject }) {
    const [pendingItems, setPendingItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [archiveOpen, setArchiveOpen] = useState(false);
    const [archivedKeys, setArchivedKeys] = useState(() => {
        const saved = localStorage.getItem('qp_archived_projects');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => { loadPendingProduction(); }, [archivedKeys]);

    async function loadPendingProduction() {
        setLoading(true);
        try {
            const projects = await fetchAllProjects();
            const logs = await fetchRejectionLogs({});
            const today = new Date();
            const items = [];

            const projectMap = new Map();
            projects.forEach(p => {
                const key = `${p.client.trim()}|||${p.project.trim()}`;
                if (!projectMap.has(key)) {
                    projectMap.set(key, {
                        client: p.client, project: p.project,
                        vertical: p.vertical, masterQty: 0,
                        deliveryDate: p.deliveryDate,
                        approvalDate: p.approvalDate
                    });
                }
                const g = projectMap.get(key);
                g.masterQty += p.masterQty;
                if (p.deliveryDate && (!g.deliveryDate || new Date(p.deliveryDate) < new Date(g.deliveryDate))) {
                    g.deliveryDate = p.deliveryDate;
                }
                if (p.approvalDate && (!g.approvalDate || new Date(p.approvalDate) < new Date(g.approvalDate))) {
                    g.approvalDate = p.approvalDate;
                }
            });

            Array.from(projectMap.values()).forEach(project => {
                const key = `${project.client}|||${project.project}`;
                const projectLogs = logs.filter(
                    log => log.client_name === project.client && log.project_name === project.project
                );
                const totalDelivered = projectLogs.reduce((sum, log) => sum + (log.qty_delivered || 0), 0);
                const pendingQty = Math.max(0, project.masterQty - totalDelivered);

                let deliveryDate = project.deliveryDate ? new Date(project.deliveryDate) : null;
                const isManualArchive = archivedKeys.includes(key);

                let overdueDays = 0;
                const isOverdue = deliveryDate && deliveryDate < today;

                let status = isManualArchive ? 'archived' : 'yellow';

                if (!isManualArchive) {
                    if (isOverdue) {
                        status = 'red';
                        overdueDays = Math.floor((today - deliveryDate) / (1000 * 60 * 60 * 24));
                    } else if (projectLogs.length > 0 && pendingQty > 0) {
                        status = 'orange';
                    } else if (pendingQty === 0) {
                        status = 'green';
                    } else {
                        status = 'yellow'; // 0 entries logged yet
                    }
                }

                if (pendingQty > 0 || status === 'archived') {
                    items.push({
                        key,
                        client: project.client, project: project.project,
                        vertical: project.vertical, masterQty: project.masterQty,
                        delivered: totalDelivered, pendingQty,
                        deliveryDate, approvalDate: project.approvalDate,
                        status, overdueDays
                    });
                }
            });

            items.sort((a, b) => {
                const statusOrder = { red: 0, orange: 1, yellow: 2, green: 3, archived: 4 };
                if (statusOrder[a.status] !== statusOrder[b.status]) {
                    return statusOrder[a.status] - statusOrder[b.status];
                }
                const dateA = a.deliveryDate ? a.deliveryDate.getTime() : Infinity;
                const dateB = b.deliveryDate ? b.deliveryDate.getTime() : Infinity;
                return dateA - dateB;
            });

            setPendingItems(items);
        } catch (error) {
            console.error('Error loading pending production:', error);
        } finally {
            setLoading(false);
        }
    }

    const toggleArchive = (e, key) => {
        e.stopPropagation();
        const newArchived = archivedKeys.includes(key)
            ? archivedKeys.filter(k => k !== key)
            : [...archivedKeys, key];
        setArchivedKeys(newArchived);
        localStorage.setItem('qp_archived_projects', JSON.stringify(newArchived));
    };

    const filteredItems = pendingItems.filter(item =>
        searchTerm === '' ||
        item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.project.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Separate: archived vs others
    const activeItems = filteredItems.filter(i => i.status !== 'archived');
    const archivedItems = filteredItems.filter(i => i.status === 'archived');

    const redCount = filteredItems.filter(i => i.status === 'red').length;
    const orangeCount = filteredItems.filter(i => i.status === 'orange').length;
    const yellowCount = filteredItems.filter(i => i.status === 'yellow').length;
    const greenCount = filteredItems.filter(i => i.status === 'green').length;
    const archivedCount = archivedItems.length;

    return (
        <section className="card">
            <div className="card-header">
                <h2>Pending Production</h2>
                <div className="card-subtitle">Work orders pending or overdue</div>
                <div className="instruction-text" style={{ fontSize: '13px', color: '#6366f1', marginTop: '4px', fontWeight: '500' }}>
                    💡 Click on any card below to automatically load the project for production entry.
                </div>
            </div>
            <div className="card-body">
                <div className="pending-toolbar">
                    <input
                        type="text"
                        placeholder="Search client..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pending-search"
                    />
                    <div className="pending-counts">
                        <span className="count-badge red">{redCount} OVERDUE</span>
                        <span className="count-badge orange">{orangeCount} PARTIAL</span>
                        <span className="count-badge yellow">{yellowCount} PENDING</span>
                        <span className="count-badge green">{greenCount} COMPLETED</span>
                    </div>
                </div>

                {loading ? (
                    <div className="pending-grid">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="pending-card" style={{ height: '180px', borderLeft: '4px solid #e0e0e0' }}>
                                <div className="pc-header-bar">
                                    <Skeleton type="text" width="100px" />
                                </div>
                                <div className="pc-body">
                                    <div className="pc-identity" style={{ gap: '8px' }}>
                                        <Skeleton type="text" width="80px" height="0.8em" />
                                        <Skeleton type="text" width="60%" height="1.2em" />
                                        <Skeleton type="text" width="80%" height="1em" />
                                    </div>
                                    <div className="pc-metrics-grid" style={{ marginTop: '16px' }}>
                                        <Skeleton type="rect" width="100%" height="40px" />
                                        <Skeleton type="rect" width="100%" height="40px" />
                                        <Skeleton type="rect" width="100%" height="40px" />
                                        <Skeleton type="rect" width="100%" height="40px" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : activeItems.length === 0 && archivedItems.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                        {searchTerm ? 'No matching items found' : 'No pending production items'}
                    </div>
                ) : (
                    <>
                        {/* ── Active items (red + orange + yellow + green) ── */}
                        {activeItems.length > 0 && (
                            <div className="pending-grid">
                                {activeItems.map((item, idx) => (
                                    <PendingCard
                                        key={idx}
                                        item={item}
                                        onClick={() => onSelectProject?.({ client: item.client, project: item.project })}
                                        onArchive={(e) => toggleArchive(e, item.key)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* ── Archive Projects — collapsible section ── */}
                        {archivedItems.length > 0 && (
                            <div className="not-added-section">
                                <button
                                    className="not-added-toggle"
                                    onClick={() => setArchiveOpen(!archiveOpen)}
                                >
                                    <span className="not-added-icon">{archiveOpen ? '▾' : '▸'}</span>
                                    <span>Archive Projects</span>
                                    <span className="not-added-count">{archivedCount}</span>
                                </button>
                                {archiveOpen && (
                                    <div className="pending-grid" style={{ marginTop: '10px' }}>
                                        {archivedItems.map((item, idx) => (
                                            <PendingCard
                                                key={`na-${idx}`}
                                                item={item}
                                                onClick={() => onSelectProject?.({ client: item.client, project: item.project })}
                                                onArchive={(e) => toggleArchive(e, item.key)}
                                                isArchived={true}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}

function PendingCard({ item, onClick, onArchive, isArchived }) {
    const statusLabels = {
        red: 'OVERDUE',
        orange: 'PARTIAL DELIVERY',
        yellow: 'PENDING PRODUCTION',
        green: 'COMPLETED',
        archived: 'ARCHIVED'
    };

    const today = new Date();
    const daysLeft = item.deliveryDate
        ? Math.ceil((item.deliveryDate - today) / (1000 * 60 * 60 * 24))
        : null;

    return (
        <div className={`pending-card ${item.status}`} onClick={onClick} style={{ cursor: 'pointer' }}>
            <div className="pc-header-bar">
                <span>{statusLabels[item.status]}</span>
                <button
                    className="archive-btn"
                    onClick={onArchive}
                    title={isArchived ? "Unarchive" : "Archive"}
                >
                    {isArchived ? '↩' : '×'}
                </button>
            </div>
            <div className="pc-body">
                <div className="pc-identity">
                    <div className="pc-approval-date">{item.approvalDate || '-'}</div>
                    <div className="pc-client-name" title={item.client}>{item.client}</div>
                    <div className="pc-proj-name" title={item.project}>{item.project}</div>
                </div>
                <div className="pc-metrics-grid">
                    <div className="pc-metric-item">
                        <div className="pc-m-label">Due Date</div>
                        <div className="pc-m-val-sm">
                            {item.deliveryDate ? formatDate(item.deliveryDate) : 'Not set'}
                        </div>
                    </div>
                    <div className="pc-metric-item pc-align-right">
                        <div className="pc-m-label">
                            {item.status === 'red' ? 'Overdue Days' : 'Days Left'}
                        </div>
                        <div className={`pc-m-val ${item.status === 'red' ? 'pc-val-urgent' : ''}`}>
                            {item.status === 'red' ? item.overdueDays : daysLeft !== null ? daysLeft : '-'}
                        </div>
                    </div>
                    <div className="pc-metric-item">
                        <div className="pc-m-label">Master Qty</div>
                        <div className="pc-m-val">{item.masterQty}</div>
                    </div>
                    <div className="pc-metric-item pc-align-right">
                        <div className="pc-m-label">Pending Master Qty</div>
                        <div className="pc-m-val">{item.pendingQty}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
