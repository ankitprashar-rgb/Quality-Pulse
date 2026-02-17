import { formatPercent } from '../utils/helpers';

export default function MetricsCards({ metrics }) {
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
                <div className={`metric-card ${overallClass}`}>
                    <div className="metric-label">Overall Rejection Rate</div>
                    <div className="metric-value">{formatPercent(overallRate)}</div>
                    <div className="metric-subtext">All entries in current view</div>
                </div>

                <div className="metric-card">
                    <div className="metric-label">Target (Max)</div>
                    <div className="metric-value">{formatPercent(targetRate)}</div>
                    <div className="metric-subtext">IDE benchmark for printed decals</div>
                </div>

                <div className="metric-card">
                    <div className="metric-label">IDE Autoworks Rejection</div>
                    <div className="metric-value">{formatPercent(autoRate)}</div>
                    <div className="metric-subtext">From Rejection Log</div>
                </div>

                <div className="metric-card">
                    <div className="metric-label">IDE Commercial Rejection</div>
                    <div className="metric-value">{formatPercent(commRate)}</div>
                    <div className="metric-subtext">From Rejection Log</div>
                </div>

                <div className="metric-card">
                    <div className="metric-label">Subumi Rejection</div>
                    <div className="metric-value">{formatPercent(subumiRate)}</div>
                    <div className="metric-subtext">From Rejection Log</div>
                </div>
            </section>

            {/* STAGE METRICS */}
            <section className="metrics-row stage">
                <div className="metric-card">
                    <div className="metric-label">Design File Rejection %</div>
                    <div className="metric-value">{formatPercent(designRate)}</div>
                    <div className="metric-subtext">Loss % of Total Input</div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Printing Rejection %</div>
                    <div className="metric-value">{formatPercent(printingRate)}</div>
                    <div className="metric-subtext">Loss % of Total Input</div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Lamination Rejection %</div>
                    <div className="metric-value">{formatPercent(laminationRate)}</div>
                    <div className="metric-subtext">Loss % of Total Input</div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Cut Rejection %</div>
                    <div className="metric-value">{formatPercent(cutRate)}</div>
                    <div className="metric-subtext">Loss % of Total Input</div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Packaging Rejection %</div>
                    <div className="metric-value">{formatPercent(packagingRate)}</div>
                    <div className="metric-subtext">Loss % of Total Input</div>
                </div>
                <div className="metric-card">
                    <div className="metric-label">Media Rejection %</div>
                    <div className="metric-value">{formatPercent(mediaRate)}</div>
                    <div className="metric-subtext">Loss % of Total Input</div>
                </div>
            </section>
        </>
    );
}
