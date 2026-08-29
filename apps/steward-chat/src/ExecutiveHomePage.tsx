import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import { STEWARD_COPY } from "./steward-copy";
import { CompanyEventsPanel } from "./CompanyEventsPanel";
import {
  fetchAgentSummary,
  fetchExecutiveHome,
  type ExecutiveAttentionItem,
  type ExecutiveGapRow,
  type ExecutiveHome,
  type ExecutiveWorkItem,
} from "./api";

const NOTIFY_KEY = "orgos.executiveHome.notify";

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

/**
 * CEO morning home — attention / gaps / delegated work.
 * ADR 0065 · GET /chat/v1/executive/home
 */
export function ExecutiveHomePage() {
  const copy = useCopy(STEWARD_COPY);
  const [data, setData] = useState<ExecutiveHome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

      {data ? (
        <>
          {(data.finance_runway_months != null ||
            data.finance_cash_balance != null ||
            data.variance) && (
            <section className="outlook-panel" aria-label="KPI">
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

          <section className="outlook-panel" aria-labelledby="exec-attention">
            <h2 id="exec-attention" className="section-title">
              {copy.executiveAttention}
            </h2>
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

          <section className="outlook-panel" aria-labelledby="exec-gaps">
            <h2 id="exec-gaps" className="section-title">
              {copy.executiveGaps}
            </h2>
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

          <section className="outlook-panel" aria-labelledby="exec-work">
            <h2 id="exec-work" className="section-title">
              {copy.executiveWork}
            </h2>
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
                        <pre className="approvals-sched-preview">
                          {summaryMd[s.path]}
                        </pre>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
          <CompanyEventsPanel />
        </>
      ) : null}
    </main>
  );
}
