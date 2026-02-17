import { useState, useEffect } from 'react';
import { fetchAllProjects } from '../services/googleSheets';
import { fetchRejectionLogs } from '../services/supabase';
import { formatDate } from '../utils/helpers';
import './PendingProduction.css';

export default function PendingProduction() {
    const [pendingItems, setPendingItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [notAddedOpen, setNotAddedOpen] = useState(false);

    useEffect(() => { loadPendingProduction(); }, []);

    async function loadPendingProduction() {
        setLoading(true);
        try {
            const projects = await fetchAllProjects();
            const logs = await fetchRejectionLogs({});
            const today = new Date();
            const pending = [];

            const projectMap = new Map();
            projects.forEach(p => {
                const key = `${p.client}|||${p.project}`;
                if (!projectMap.has(key)) {
                    projectMap.set(key, {
                        client: p.client, project: p.project,
                        vertical: p.vertical, masterQty: 0,
                        deliveryDate: p.deliveryDate
                    });
                }
                const g = projectMap.get(key);
                g.masterQty += p.masterQty;
                if (p.deliveryDate && (!g.deliveryDate || new Date(p.deliveryDate) < new Date(g.deliveryDate))) {
                    g.deliveryDate = p.deliveryDate;
                }
            });

            Array.from(projectMap.values()).forEach(project => {
                const projectLogs = logs.filter(
                    log => log.client_name === project.client && log.project_name === project.project
                );
                const totalDelivered = projectLogs.reduce((sum, log) => sum + (log.qty_delivered || 0), 0);
                const pendingQty = Math.max(0, project.masterQty - totalDelivered);

                let deliveryDate = project.deliveryDate ? new Date(project.deliveryDate) : null;

                let status = 'yellow';
                let overdueDays = 0;
                const isOverdue = deliveryDate && deliveryDate < today;

                if (isOverdue) {
                    status = 'red';
                    overdueDays = Math.floor((today - deliveryDate) / (1000 * 60 * 60 * 24));
                } else if (projectLogs.length > 0 && pendingQty > 0) {
                    status = 'orange';
                }

                if (pendingQty > 0) {
                    pending.push({
                        client: project.client, project: project.project,
                        vertical: project.vertical, masterQty: project.masterQty,
                        delivered: totalDelivered, pendingQty,
                        deliveryDate, status, overdueDays
                    });
                }
            });

            pending.sort((a, b) => {
                const statusOrder = { red: 0, orange: 1, yellow: 2 };
                if (statusOrder[a.status] !== statusOrder[b.status]) {
                    return statusOrder[a.status] - statusOrder[b.status];
                }
                const dateA = a.deliveryDate ? a.deliveryDate.getTime() : Infinity;
                const dateB = b.deliveryDate ? b.deliveryDate.getTime() : Infinity;
                return dateA - dateB;
            });

            setPendingItems(pending);
        } catch (error) {
            console.error('Error loading pending production:', error);
        } finally {
            setLoading(false);
        }
    }

    const filteredItems = pendingItems.filter(item =>
        searchTerm === '' ||
        item.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.project.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Separate: red+orange vs yellow (Not Added)
    const activeItems = filteredItems.filter(i => i.status !== 'yellow');
    const notAddedItems = filteredItems.filter(i => i.status === 'yellow');

    const redCount = filteredItems.filter(i => i.status === 'red').length;
    const orangeCount = filteredItems.filter(i => i.status === 'orange').length;
    const yellowCount = notAddedItems.length;

    return (
        <section className="card">
            <div className="card-header">
                <h2>Pending Production</h2>
                <div className="card-subtitle">Work orders pending or overdue</div>
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
                        <span className="count-badge yellow">{yellowCount} NOT ADDED</span>
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                        Loading pending production...
                    </div>
                ) : activeItems.length === 0 && notAddedItems.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                        {searchTerm ? 'No matching items found' : 'No pending production items'}
                    </div>
                ) : (
                    <>
                        {/* ── Active items (red + orange) ── */}
                        {activeItems.length > 0 && (
                            <div className="pending-grid">
                                {activeItems.map((item, idx) => (
                                    <PendingCard key={idx} item={item} />
                                ))}
                            </div>
                        )}

                        {/* ── Not Added — collapsible section ── */}
                        {notAddedItems.length > 0 && (
                            <div className="not-added-section">
                                <button
                                    className="not-added-toggle"
                                    onClick={() => setNotAddedOpen(!notAddedOpen)}
                                >
                                    <span className="not-added-icon">{notAddedOpen ? '▾' : '▸'}</span>
                                    <span>Not Added to Rejection Log</span>
                                    <span className="not-added-count">{yellowCount}</span>
                                </button>
                                {notAddedOpen && (
                                    <div className="pending-grid" style={{ marginTop: '10px' }}>
                                        {notAddedItems.map((item, idx) => (
                                            <PendingCard key={`na-${idx}`} item={item} />
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

function PendingCard({ item }) {
    const statusLabels = {
        red: 'OVERDUE',
        orange: 'PARTIAL DELIVERY',
        yellow: 'NOT ADDED TO REJECTION LOG'
    };

    const today = new Date();
    const daysLeft = item.deliveryDate
        ? Math.ceil((item.deliveryDate - today) / (1000 * 60 * 60 * 24))
        : null;

    return (
        <div className={`pending-card ${item.status}`}>
            <div className="pc-header-bar">{statusLabels[item.status]}</div>
            <div className="pc-body">
                <div className="pc-identity">
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
