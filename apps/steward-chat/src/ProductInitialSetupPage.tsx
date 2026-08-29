import { useCallback, useEffect, useState } from "react";
import { fetchProductInitialSetup, type ProductInitialSetupReport } from "./api";
import { OpsPage } from "./OpsPage";
import { StripeBillingSettingsCard } from "./StripeBillingSettingsCard";

export function ProductInitialSetupPage() {
  const [report, setReport] = useState<ProductInitialSetupReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReport(await fetchProductInitialSetup());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <OpsPage
      title="本番前の初期設定"
      lead="本番投入の前にここで Stripe 等を設定します。開発用 env ファイルの手編集は不要です。"
      loading={!report}
      loadingLabel="読み込み中…"
      error={error}
      className="product-initial-setup-page"
    >
      {report && (
        <>
          <section className="ops-card">
            <h2 className="section-title">準備状況</h2>
            <p className="muted">
              商用 readiness: <strong>{report.commercial_score}/100</strong>
              {report.commercial_ready
                ? " — 全項目達成"
                : " — Stripe キー保存で stripe-live が加算されます"}
            </p>
            <p className="muted">
              本番前セットアップ:{" "}
              {report.pre_production_ready ? "完了" : "未完了（下記チェックリスト）"}
            </p>
            <ul>
              {report.steps.map((step) => (
                <li key={step.id}>
                  {step.complete ? "✓" : "·"} {step.label}
                  {step.detail ? ` — ${step.detail}` : ""}
                  {step.phase === "go_live" && !step.complete && (
                    <span className="muted">（本番課金投入時）</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <StripeBillingSettingsCard onSaved={() => void load()} />
        </>
      )}
    </OpsPage>
  );
}
