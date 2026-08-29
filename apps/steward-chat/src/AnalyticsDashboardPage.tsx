import { useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import {
  fetchAnalyticsDashboard,
  type AnalyticsDashboardPayload,
  type AnalyticsKpiRow,
} from "./api";
import { OPS_PAGES_COPY } from "./ops-pages-copy";

function pctBar(actual: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((actual / target) * 100));
}

/** Mirrors the Executive home target formatting so both pages read the same. */
function formatTarget(value: number | null, unit: string): string {
  if (value == null) return "—";
  if (unit === "yen") return `${Math.round(value).toLocaleString("ja-JP")} 円`;
  if (unit === "percent") return `${value}%`;
  if (unit === "months") return `${value} ヶ月`;
  return String(value);
}

function momSummary(rows: AnalyticsKpiRow[]): string {
  const withMom = rows.filter((r) => r.mom_delta !== null).length;
  return `${withMom}/${rows.length}`;
}

function formatMom(row: AnalyticsKpiRow): string {
  if (row.mom_delta === null) return "—";
  const sign = row.mom_delta > 0 ? "+" : "";
  const pct = row.mom_delta_pct === null ? "" : ` (${row.mom_delta_pct > 0 ? "+" : ""}${row.mom_delta_pct}%)`;
  return `${sign}${Math.round(row.mom_delta * 10) / 10}${pct}`;
}

function KpiBar({ row }: { row: AnalyticsKpiRow }) {
  const actual = row.actual.value;
  const target = row.target_value;
  if (actual == null || target == null || target <= 0) return null;
  const width = pctBar(actual, target);
  const tone =
    row.rag === "red" ? "tone-0" : row.rag === "amber" ? "tone-2" : "tone-4";
  return (
    <div className="analytics-kpi-bar-row">
      <div className="analytics-kpi-bar-label">
        <span>{row.metric.title}</span>
        <span className="muted">{row.actual.formatted}</span>
      </div>
      <div className="distribution-bar analytics-bar">
        <div
          className={`distribution-segment ${tone}`}
          style={{ width: `${width}%` }}
          title={`${width}% of target`}
        />
      </div>
    </div>
  );
}

export function AnalyticsDashboardPage() {
  const copy = useCopy(OPS_PAGES_COPY);
  const [payload, setPayload] = useState<AnalyticsDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchAnalyticsDashboard();
        if (!cancelled) {
          setPayload(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const kpi = payload?.kpi;
  const stats = payload?.view_model.sections.find((s) => s.type === "stats");

  return (
    <main className="workspace analytics-dashboard">
      <div className="page-heading">
        <div>
          <h1 className="ops-page-title">{copy.analyticsTitle}</h1>
          <p className="ops-page-lead">
            {copy.analyticsLead}
          </p>
        </div>
      </div>

      {loading && <div className="loading-panel">{copy.loading}</div>}
      {error && <div className="error-banner">{error}</div>}

      {kpi && (
        <>
          <section className="outlook-panel">
            <h2 className="section-title">{copy.summary}</h2>
            <div className="outlook-kpi summary-grid">
              <div>
                <span className="kpi-value">{kpi.summary.green}</span>
                <span className="kpi-label">{copy.kpiGreen}</span>
              </div>
              <div>
                <span className="kpi-value">{kpi.summary.amber}</span>
                <span className="kpi-label">{copy.kpiAmber}</span>
              </div>
              <div>
                <span className="kpi-value">{kpi.summary.red}</span>
                <span className="kpi-label">{copy.kpiRed}</span>
              </div>
              <div>
                <span className="kpi-value">{payload?.data_quality_overall ?? "—"}</span>
                <span className="kpi-label">{copy.dataQuality}</span>
              </div>
              <div>
                <span className="kpi-value">{momSummary(kpi.rows)}</span>
                <span className="kpi-label">{copy.momPresent}</span>
              </div>
            </div>
          </section>

          <section className="outlook-panel">
            <h2 className="section-title">{copy.attainment}</h2>
            {kpi.rows.map((row) => (
              <KpiBar key={row.metric.id} row={row} />
            ))}
            {kpi.rows.length === 0 && (
              <div className="empty-state">
                <strong>{copy.noMetrics}</strong>
                <p>{copy.noMetricsHint}</p>
              </div>
            )}
          </section>

          <section className="outlook-panel">
            <h2 className="section-title">{copy.kpiList}</h2>
            <div className="category-table">
              <div className="category-table-head analytics-table-head">
                <span>{copy.colRag}</span>
                <span>{copy.colMetric}</span>
                <span>{copy.colActual}</span>
                <span>{copy.colTarget}</span>
                <span>{copy.colMom}</span>
              </div>
              {kpi.rows.map((row) => (
                <div key={row.metric.id} className="category-table-row analytics-table-row">
                  <span className={`executive-rag executive-rag-${row.rag}`}>
                    {row.rag === "green"
                      ? copy.kpiGreen
                      : row.rag === "amber"
                        ? copy.kpiAmber
                        : row.rag === "red"
                          ? copy.kpiRed
                          : copy.kpiUnknown}
                  </span>
                  <span>{row.metric.title}</span>
                  <span>{row.actual.formatted}</span>
                  <span>{formatTarget(row.target_value, row.metric.unit)}</span>
                  <span className="muted">{formatMom(row)}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
