export default function ViewToggle({ mode, onModeChange }) {
    return (
        <div className="toolbar">
            <div className="view-toggle">
                <span className="toolbar-label">View</span>
                <button
                    className={`toggle-btn ${mode === 'all' ? 'active' : ''}`}
                    onClick={() => onModeChange('all')}
                >
                    All Time
                </button>
                <button
                    className={`toggle-btn ${mode === 'today' ? 'active' : ''}`}
                    onClick={() => onModeChange('today')}
                >
                    Today
                </button>
                <button
                    className={`toggle-btn ${mode === 'month' ? 'active' : ''}`}
                    onClick={() => onModeChange('month')}
                >
                    This Month
                </button>
            </div>
        </div>
    );
}
