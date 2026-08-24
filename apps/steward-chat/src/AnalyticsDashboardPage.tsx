import { useEffect, useState } from "react";
import {
  fetchAnalyticsDashboard,
  type AnalyticsDashboardPayload,
  type AnalyticsKpiRow,
} from "./api";

function pctBar(actual: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((actual / target) * 100));
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
          <h1 className="ops-page-title">分析ダッシュボード</h1>
          <p className="ops-page-lead">
            KPI スコアカードとデータ品質（決定論 · resolver 経由）
          </p>
        </div>
      </div>

      {loading && <div className="loading-panel">読み込み中…</div>}
      {error && <div className="error-banner">{error}</div>}

      {kpi && (
        <>
          <section className="outlook-panel">
            <h2 className="section-title">サマリー</h2>
            <div className="outlook-kpi summary-grid">
              <div>
                <span className="kpi-value">{kpi.summary.green}</span>
                <span className="kpi-label">正常</span>
              </div>
              <div>
                <span className="kpi-value">{kpi.summary.amber}</span>
                <span className="kpi-label">注意</span>
              </div>
              <div>
                <span className="kpi-value">{kpi.summary.red}</span>
                <span className="kpi-label">要対応</span>
              </div>
              <div>
                <span className="kpi-value">{payload?.data_quality_overall ?? "—"}</span>
                <span className="kpi-label">データ品質</span>
              </div>
              <div>
                <span className="kpi-value">{momSummary(kpi.rows)}</span>
                <span className="kpi-label">前月比あり</span>
              </div>
            </div>
            {stats?.type === "stats" && (
              <p className="page-desc muted">
                {payload?.view_model.summary}
              </p>
            )}
          </section>

          <section className="outlook-panel">
            <h2 className="section-title">目標達成率</h2>
            {kpi.rows.map((row) => (
              <KpiBar key={row.metric.id} row={row} />
            ))}
            {kpi.rows.length === 0 && (
              <p className="empty-panel">metrics.yaml に定義がありません。</p>
            )}
          </section>

          <section className="outlook-panel">
            <h2 className="section-title">KPI 一覧</h2>
            <div className="category-table">
              <div className="category-table-head analytics-table-head">
                <span>RAG</span>
                <span>指標</span>
                <span>実測</span>
                <span>目標</span>
                <span>前月比</span>
              </div>
              {kpi.rows.map((row) => (
                <div key={row.metric.id} className="category-table-row analytics-table-row">
                  <span>{row.rag === "green" ? "🟢" : row.rag === "amber" ? "🟡" : row.rag === "red" ? "🔴" : "?"}</span>
                  <span>{row.metric.title}</span>
                  <span>{row.actual.formatted}</span>
                  <span>{row.target_value ?? "—"}</span>
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
