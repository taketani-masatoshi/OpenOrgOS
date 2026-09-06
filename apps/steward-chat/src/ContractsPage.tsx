import { useCallback, useEffect, useState } from "react";
import {
  fetchContractStatus,
  type ExecutiveStaticReportSlot,
} from "./api";
import { emptyDigestSlots } from "./digestSlots";
import { LiveSection } from "./LiveSection";
import { OpsPage } from "./OpsPage";
import { StaticDigestHeader } from "./StaticDigestHeader";

type Status = Awaited<ReturnType<typeof fetchContractStatus>>;

const EMPTY = emptyDigestSlots(
  "契約ステータス",
  "orgos contracts digest --period weekly --write",
  "orgos contracts digest --period monthly --write",
);

/**
 * L1 contract portfolio — CLI digest MD primary; live counts via LiveSection.
 */
export function ContractsPage() {
  const [slots, setSlots] = useState<{
    weekly: ExecutiveStaticReportSlot;
    monthly: ExecutiveStaticReportSlot;
  }>(EMPTY);
  const [payload, setPayload] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staticReady, setStaticReady] = useState(false);

  useEffect(() => {
    void fetchContractStatus()
      .then((data) => {
        setSlots(data.static_reports ?? EMPTY);
        setStaticReady(true);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setStaticReady(true);
      });
  }, []);

  const loadLive = useCallback(() => {
    void fetchContractStatus()
      .then(setPayload)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <OpsPage
      title="契約"
      lead="CLI 週次・月次ダイジェストを主表示。件数・期限・退出窓のライブ面は下段で遅延読込。"
      error={error}
      loading={!staticReady && !error}
    >
      <StaticDigestHeader
        title="契約ステータス"
        slots={slots}
        weeklyEmptyLabel="週次ダイジェストがありません。orgos contracts digest --period weekly --write"
        monthlyEmptyLabel="月次ダイジェストがありません。orgos contracts digest --period monthly --write"
      />

      <LiveSection aria-label="ライブ契約ポートフォリオ" onVisible={loadLive}>
        {payload ? (
          <section className="ops-card outlook-panel">
            <h2 className="section-title">ライブ契約ポートフォリオ</h2>
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
          </section>
        ) : (
          <div className="loading-panel">ライブ読込中…</div>
        )}
      </LiveSection>

      <p className="section-cta">
        <a className="btn btn-ghost btn-sm" href="/org/">
          組織へ
        </a>
      </p>
    </OpsPage>
  );
}
