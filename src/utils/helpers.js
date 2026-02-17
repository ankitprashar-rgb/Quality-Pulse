/**
 * Numeric precision helpers
 * Rule: Max 3 decimals (default), Truncate, No trailing zeros
 * Rejection %: Max 2 decimals
 */

export function strictTruncate(val, precision = 3) {
    const n = Number(val);
    if (isNaN(n) || !isFinite(n)) return 0;
    if (Number.isInteger(n)) return n;
    const factor = Math.pow(10, precision);
    return Math.trunc(n * factor) / factor;
}

export function formatNum(val) {
    const truncated = strictTruncate(val, 3);
    return truncated.toString();
}

export function formatPercent(value) {
    if (value === null || value === undefined || isNaN(value)) return '0%';
    return strictTruncate(value, 2) + '%';
}

/**
 * Date formatting utilities
 */
export function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function getTodayDate() {
    const today = new Date();
    return formatDate(today);
}

/**
 * Calculate rejection metrics
 */
export function calculateRejectionRate(rejected, total) {
    if (!total || total === 0) return 0;
    return strictTruncate((rejected / total) * 100, 2);
}

export function calculateRemaining(masterQty, delivered) {
    return strictTruncate(Math.max(0, masterQty - delivered));
}

/**
 * HTML escape for security
 */
export function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Export to Excel filename generator
 */
export function generateExcelFilename(clientName, type = 'QualityPulse') {
    const date = getTodayDate();
    const cleanClient = clientName ? clientName.replace(/[^a-zA-Z0-9]/g, '_') : 'All';
    return `${type}_${cleanClient}_${date}.xlsx`;
}
