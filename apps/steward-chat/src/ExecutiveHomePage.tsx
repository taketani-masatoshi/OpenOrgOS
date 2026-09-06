import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";
import { CompanyEventsPanel } from "./CompanyEventsPanel";
import { MarkdownBody } from "./MarkdownBody";
import {
  fetchAgentSummary,
  fetchExecutiveHome,
  type ExecutiveAttentionItem,
  type ExecutiveGapRow,
  type ExecutiveHome,
  type ExecutiveStaticReportSlot,
  type ExecutiveWorkItem,
} from "./api";

const NOTIFY_KEY = "orgos.executiveHome.notify";

type ReportTab = "weekly" | "monthly";

function maybeNotifyAttention(count: number) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (localStorage.getItem(NOTIFY_KEY) !== "1") return;
  if (count <= 0) return;
  if (Notification.permission === "granted") {
    new Notification("OpenOrgOS", {
      body: `要対応 ${count} 件`,
      tag: "orgos-executive-attention",
    });
  } else if (Notification.permission === "default") {
    void Notification.requestPermission().then((perm) => {
      if (perm === "granted") {
        new Notification("OpenOrgOS", {
          body: `要対応 ${count} 件`,
          tag: "orgos-executive-attention",
        });
      }
    });
  }
}

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")} 円`;
}

type Copy = ReturnType<typeof useCopy<typeof STEWARD_COPY.ja>>;

function kindLabel(kind: ExecutiveAttentionItem["kind"], copy: Copy): string {
  switch (kind) {
    case "customer":
      return copy.executiveKindCustomer;
    case "mail":
      return copy.executiveKindMail;
    case "scheduling":
      return copy.executiveKindScheduling;
    case "ceo_question":
      return copy.executiveKindCeoQuestion;
    case "approval":
      return copy.executiveKindApproval;
    case "wire":
      return copy.executiveKindWire;
    case "handoff":
      return copy.executiveKindHandoff;
    default:
      return kind;
  }
}

function ragLabel(rag: ExecutiveGapRow["rag"], copy: Copy): string {
  switch (rag) {
    case "green":
      return copy.executiveRagGreen;
    case "amber":
      return copy.executiveRagAmber;
    case "red":
      return copy.executiveRagRed;
    case "unknown":
      return copy.executiveRagUnknown;
  }
}

function AttentionCard({ item, copy }: { item: ExecutiveAttentionItem; copy: Copy }) {
  return (
    <a className="executive-card" href={item.href}>
      <span className={`executive-severity executive-severity-${item.severity ?? "p2"}`}>
        {(item.severity ?? "p2").toUpperCase()}
      </span>
      <span className="executive-card-kind">{kindLabel(item.kind, copy)}</span>
      <strong className="executive-card-title">{item.title}</strong>
    </a>
  );
}

function GapRow({ row, copy }: { row: ExecutiveGapRow; copy: Copy }) {
  return (
    <a className="executive-gap-row" href={row.href}>
      <span className={`executive-rag executive-rag-${row.rag}`}>
        {ragLabel(row.rag, copy)}
      </span>
      <span className="executive-gap-title">{row.title}</span>
      <span className="executive-gap-actual">{row.actual_formatted}</span>
      <span className="executive-gap-target muted">
        {row.target_formatted ?? copy.executiveTargetMissing}
      </span>
    </a>
  );
}

function WorkColumn({
  label,
  items,
  empty,
}: {
  label: string;
  items: ExecutiveWorkItem[];
  empty: string;
}) {
  return (
    <div className="executive-work-col">
      <h3 className="executive-work-col-title">
        {label}{" "}
        <span className="muted">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="muted page-desc">{empty}</p>
      ) : (
        <ul className="executive-work-list">
          {items.map((w) => (
            <li key={w.id}>
              <a href={w.href}>
                <strong>{w.title}</strong>
                <span className="muted">
                  {w.assignee_label ?? w.agent ?? w.status}
                  {w.due_date ? ` · ${w.due_date}` : ""}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StaticReportPanel({
  slot,
  emptyLabel,
}: {
  slot: ExecutiveStaticReportSlot;
  emptyLabel: string;
}) {
  if (!slot.markdown) {
    return (
      <div className="executive-report-empty">
        <p className="page-desc muted">{emptyLabel}</p>
        <p className="page-desc">
          <code className="executive-report-hint">{slot.generate_hint}</code>
        </p>
      </div>
    );
  }

  return (
    <div className="executive-report-body">
      <div className="executive-report-meta muted">
        <span>{slot.title}</span>
        {slot.as_of ? <span> · {slot.as_of}</span> : null}
        {slot.path ? <span> · {slot.path}</span> : null}
      </div>
      <MarkdownBody className="executive-report-md">{slot.markdown}</MarkdownBody>
      <p className="page-desc muted executive-report-regen">
        <code className="executive-report-hint">{slot.generate_hint}</code>
      </p>
    </div>
  );
}

/**
 * CEO morning home — static dashboard/brief MD primary; live KPI secondary.
 * ADR 0065 · GET /chat/v1/executive/home
 */
export function ExecutiveHomePage() {
  const copy = useCopy(STEWARD_COPY);
  const [data, setData] = useState<ExecutiveHome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportTab, setReportTab] = useState<ReportTab>("weekly");
  const [summaryMd, setSummaryMd] = useState<Record<string, string>>({});
  const [summaryBusy, setSummaryBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const home = await fetchExecutiveHome();
      setData(home);
      maybeNotifyAttention(home.attention_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const slot =
    data == null
      ? null
      : reportTab === "weekly"
        ? data.static_reports.weekly
        : data.static_reports.monthly;

  const emptyLabel =
    reportTab === "weekly"
      ? copy.executiveReportWeeklyEmpty
      : copy.executiveReportMonthlyEmpty;

  return (
    <main className="workspace executive-home">
      <div className="page-heading">
        <div>
          <h1 className="ops-page-title">{copy.executiveTitle}</h1>
          <p className="ops-page-lead">
            {data
              ? `${data.company_name} · ${data.report_date}`
              : copy.executiveLead}
          </p>
        </div>
        <div className="section-actions">
          <button
            type="button"
            className="quiet-button"
            disabled={loading}
            onClick={() => void reload()}
          >
            {copy.executiveRefresh}
          </button>
          <a className="btn btn-primary btn-sm" href="/steward/">
            {copy.executiveAskSteward}
          </a>
        </div>
      </div>

      {loading && !data ? <div className="loading-panel">…</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      {data && slot ? (
        <>
          <section className="outlook-panel" aria-labelledby="exec-reports">
            <h2 id="exec-reports" className="section-title">
              {copy.executiveReports}
            </h2>
            <nav className="view-tabs" aria-label={copy.executiveReports}>
              {(
                [
                  ["weekly", copy.executiveReportWeekly],
                  ["monthly", copy.executiveReportMonthly],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={reportTab === id ? "active" : ""}
                  onClick={() => setReportTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <StaticReportPanel slot={slot} emptyLabel={emptyLabel} />
          </section>

          <CompanyEventsPanel />

          <details className="executive-live-details outlook-panel">
            <summary className="section-title">{copy.executiveLiveStatus}</summary>

            {(data.finance_runway_months != null ||
              data.finance_cash_balance != null ||
              data.variance) && (
              <section className="executive-live-kpi" aria-label="KPI">
                <div className="outlook-kpi summary-grid">
                  {data.finance_runway_months != null ? (
                    <div>
                      <span className="kpi-value">
                        {data.finance_runway_months}
                      </span>
                      <span className="kpi-label">{copy.executiveRunway}</span>
                    </div>
                  ) : null}
                  {data.finance_cash_balance != null ? (
                    <div>
                      <span className="kpi-value">
                        {formatYen(data.finance_cash_balance)}
                      </span>
                      <span className="kpi-label">{copy.executiveCash}</span>
                    </div>
                  ) : null}
                  {data.variance ? (
                    <div>
                      <span className="kpi-value">
                        {formatYen(data.variance.delta_total)}
                      </span>
                      <span className="kpi-label">
                        {copy.executiveVariance} ({data.variance.fiscal_year})
                      </span>
                    </div>
                  ) : null}
                  <div>
                    <span className="kpi-value">{data.attention_count}</span>
                    <span className="kpi-label">{copy.executiveAttention}</span>
                  </div>
                  <div>
                    <span className="kpi-value">{data.work_open_count}</span>
                    <span className="kpi-label">{copy.executiveWork}</span>
                  </div>
                </div>
              </section>
            )}

            <section aria-labelledby="exec-attention">
              <h3 id="exec-attention" className="executive-work-col-title">
                {copy.executiveAttention}
              </h3>
              {data.attention.length === 0 ? (
                <p className="page-desc muted">{copy.executiveAttentionEmpty}</p>
              ) : (
                <div className="executive-card-grid">
                  {data.attention.map((item) => (
                    <AttentionCard key={item.id} item={item} copy={copy} />
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="exec-gaps">
              <h3 id="exec-gaps" className="executive-work-col-title">
                {copy.executiveGaps}
              </h3>
              <p className="page-desc muted">
                {copy.executiveRagGreen} {data.gap_summary.green} ·{" "}
                {copy.executiveRagAmber} {data.gap_summary.amber} ·{" "}
                {copy.executiveRagRed} {data.gap_summary.red} ·{" "}
                {copy.executiveRagUnknown} {data.gap_summary.unknown}
              </p>
              {data.gaps.length === 0 ? (
                <p className="page-desc muted">{copy.executiveGapsEmpty}</p>
              ) : (
                <div className="executive-gap-list">
                  <div className="executive-gap-head" aria-hidden="true">
                    <span />
                    <span />
                    <span>{copy.executiveGapActual}</span>
                    <span>{copy.executiveGapTarget}</span>
                  </div>
                  {data.gaps.map((row) => (
                    <GapRow key={row.id} row={row} copy={copy} />
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="exec-work">
              <h3 id="exec-work" className="executive-work-col-title">
                {copy.executiveWork}
              </h3>
              {data.work_open_count === 0 ? (
                <p className="page-desc muted">{copy.executiveWorkEmpty}</p>
              ) : (
                <div className="executive-work-grid">
                  <WorkColumn
                    label={copy.executiveWorkEmployee}
                    items={data.work.employee}
                    empty={copy.executiveWorkEmpty}
                  />
                  <WorkColumn
                    label={copy.executiveWorkGuest}
                    items={data.work.guest}
                    empty={copy.executiveWorkEmpty}
                  />
                  <WorkColumn
                    label={copy.executiveWorkAi}
                    items={data.work.ai}
                    empty={copy.executiveWorkEmpty}
                  />
                  <WorkColumn
                    label={copy.executiveWorkUnassigned}
                    items={data.work.unassigned}
                    empty={copy.executiveWorkEmpty}
                  />
                </div>
              )}
              {(data.agent_summaries?.length ?? 0) > 0 ? (
                <div className="executive-summaries">
                  <h3 className="executive-work-col-title">
                    {copy.executiveAgentSummaries}
                  </h3>
                  <ul className="executive-summary-list">
                    {data.agent_summaries!.map((s) => (
                      <li key={s.path}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={summaryBusy === s.path}
                          onClick={() => {
                            if (summaryMd[s.path]) {
                              setSummaryMd((prev) => {
                                const next = { ...prev };
                                delete next[s.path];
                                return next;
                              });
                              return;
                            }
                            setSummaryBusy(s.path);
                            void fetchAgentSummary(s.path)
                              .then((r) => {
                                setSummaryMd((prev) => ({
                                  ...prev,
                                  [s.path]: r.markdown,
                                }));
                              })
                              .catch((err) => {
                                setError(
                                  err instanceof Error ? err.message : String(err),
                                );
                              })
                              .finally(() => setSummaryBusy(null));
                          }}
                        >
                          {s.label}
                        </button>
                        {summaryMd[s.path] ? (
                          <MarkdownBody className="executive-summary-md">
                            {summaryMd[s.path]}
                          </MarkdownBody>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          </details>
        </>
      ) : null}
    </main>
  );
}
