export default function Toast({ visible, message }) {
    return (
        <div className={`toast-container ${visible ? 'visible' : ''}`}>
            <div className="toast-icon">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path>
                </svg>
            </div>
            <div>{message}</div>
        </div>
    );
}
