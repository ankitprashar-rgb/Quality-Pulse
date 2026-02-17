export default function Loader({ visible }) {
    return (
        <div className={`loader-overlay ${visible ? 'visible' : ''}`}>
            <div className="loader-box">
                <div className="loader-dot"></div>
                <div>Processing... please wait</div>
            </div>
        </div>
    );
}
