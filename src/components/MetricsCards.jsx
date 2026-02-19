import { formatPercent } from '../utils/helpers';
import Skeleton from './Skeleton';

export default function MetricsCards({ metrics, loading }) {
    if (!metrics) return null;

    const { overallRate, targetRate, autoRate, commRate, subumiRate, designRate, printingRate, laminationRate, cutRate, packagingRate, mediaRate } = metrics;

    // Determine overall card status
    let overallClass = 'primary';
    if (overallRate > 0) {
        overallClass = overallRate <= targetRate ? 'primary good' : 'primary bad';
    }

    return (
        <>
            {/* TOP METRICS */}
            <section className="metrics-row">
                <div className={`metric-card ${loading ? '' : overallClass}`}>
                    <div className="metric-label">Overall Rejection Rate</div>
                    <div className="metric-value">
                        {loading ? <Skeleton type="text" width="60%" height="1.2em" /> : formatPercent(overallRate)}
                    </div>
                    <div className="metric-subtext">All entries in current view</div>
                </div>

                <div className="metric-card">
                    <div className="metric-label">Target (Max)</div>
                    <div className="metric-value">
                        {loading ? <Skeleton type="text" width="60%" height="1.2em" /> : formatPercent(targetRate)}
                    </div>
                    <div className="metric-subtext">IDE benchmark for printed decals</div>
                </div>

                <div className="metric-card">
                    <div className="metric-label">IDE Autoworks Rejection</div>
                    <div className="metric-value">
                        {loading ? <Skeleton type="text" width="60%" height="1.2em" /> : formatPercent(autoRate)}
                    </div>
                    <div className="metric-subtext">From Rejection Log</div>
                </div>

                <div className="metric-card">
                    <div className="metric-label">IDE Commercial Rejection</div>
                    <div className="metric-value">
                        {loading ? <Skeleton type="text" width="60%" height="1.2em" /> : formatPercent(commRate)}
                    </div>
                    <div className="metric-subtext">From Rejection Log</div>
                </div>

                <div className="metric-card">
                    <div className="metric-label">Subumi Rejection</div>
                    <div className="metric-value">
                        {loading ? <Skeleton type="text" width="60%" height="1.2em" /> : formatPercent(subumiRate)}
                    </div>
                    <div className="metric-subtext">From Rejection Log</div>
                </div>
            </section>

            {/* STAGE METRICS */}
            <section className="metrics-row stage">
                {['Design File', 'Printing', 'Lamination', 'Cut', 'Packaging', 'Media'].map((stage, idx) => {
                    const rates = [designRate, printingRate, laminationRate, cutRate, packagingRate, mediaRate];
                    return (
                        <div className="metric-card" key={idx}>
                            <div className="metric-label">{stage} Rejection %</div>
                            <div className="metric-value">
                                {loading ? <Skeleton type="text" width="60%" height="1.2em" /> : formatPercent(rates[idx])}
                            </div>
                            <div className="metric-subtext">Loss % of Total Input</div>
                        </div>
                    );
                })}
            </section>
        </>
    );
}
