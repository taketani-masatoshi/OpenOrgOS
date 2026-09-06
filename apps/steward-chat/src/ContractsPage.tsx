import { useEffect, useState } from "react";
import { fetchContractStatus, type ExecutiveStaticReportSlot } from "./api";
import { OpsPage } from "./OpsPage";
import { StaticReportPanel } from "./StaticReportPanel";

type Status = Awaited<ReturnType<typeof fetchContractStatus>>;

/**
 * L1 contract portfolio — CLI digest MD primary; live counts secondary.
 */
export function ContractsPage() {
  const [payload, setPayload] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchContractStatus()
      .then(setPayload)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const slot: ExecutiveStaticReportSlot | null = payload?.static_report ?? null;

  return (
    <OpsPage
      title="契約"
      lead="CLI ダイジェストを主表示。件数・期限・退出窓のライブ面は二次。契約本文は出しません。"
      error={error}
      loading={!payload && !error}
    >
      {payload ? (
        <>
          <section className="ops-card outlook-panel">
            <h2 className="section-title">契約ステータス</h2>
            <StaticReportPanel
              slot={
                slot ?? {
                  path: null,
                  title: "契約ステータス",
                  as_of: null,
                  markdown: null,
                  generate_hint: "orgos contracts digest --write",
                }
              }
              emptyLabel="ダイジェストがありません。orgos contracts digest --write を実行してください。"
            />
          </section>

          <details className="ops-card executive-live-details">
            <summary className="section-title">ライブ契約ポートフォリオ</summary>
            <section>
              <h3 className="section-title">{payload.company_name}</h3>
              <p className="ops-page-meta">
                {payload.as_of} · 合計 {payload.total} · 締結 {payload.by_status.executed} ·
                署名待 {payload.by_status.pending_signature} · 下書き {payload.by_status.draft} ·
                終了 {payload.by_status.terminated}
              </p>
              {payload.notes.map((n) => (
                <p key={n} className="muted">
                  {n}
                </p>
              ))}
            </section>
            <section>
              <h3 className="section-title">アラート</h3>
              {payload.alerts.length === 0 ? (
                <p className="muted">期限アラートはありません</p>
              ) : (
                <ul>
                  {payload.alerts.map((a) => (
                    <li key={`${a.contractId}-${a.alertType}`}>
                      {a.contractName} · {a.alertType} · {a.deadline}（残 {a.daysRemaining} 日）
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="section-title">退出窓</h3>
              {payload.exit_opportunities.length === 0 ? (
                <p className="muted">期限内の退出窓はありません</p>
              ) : (
                <ul>
                  {payload.exit_opportunities.map((row) => (
                    <li key={`${row.contract_id}-${row.kind}-${row.deadline}`}>
                      {row.contract_name} · {row.kind} · {row.deadline} · {row.summary}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </details>

          <p className="section-cta">
            <a className="btn btn-ghost btn-sm" href="/org/">
              組織へ
            </a>
          </p>
        </>
      ) : null}
    </OpsPage>
  );
}
