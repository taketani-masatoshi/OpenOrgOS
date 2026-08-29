import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@ops-shared/define-copy";
import {
  fetchCustomersAfterSales,
  fetchCustomersChurn,
  fetchCustomersInbound,
  fetchCustomersNav,
  fetchCustomersOutbound,
  fetchCustomersPipeline,
  fetchCustomersAccounts,
  postCustomersDealSetNextAction,
  postCustomersDealSetStage,
  postCustomersInquiryPromote,
  type CustomersNavGate,
} from "./api";
import { OpsPage } from "./OpsPage";
import { STEWARD_COPY } from "./steward-copy";

export type CustomersWorkbenchView =
  | "customers-outbound"
  | "customers-inbound"
  | "customers-pipeline"
  | "customers-accounts"
  | "customers-after-sales"
  | "customers-churn";

type LockedPayload = {
  locked?: boolean;
  module_id?: string;
  message?: string;
};

const DEAL_STAGES = [
  "lead",
  "qualify",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

const LOST_REASONS = [
  "price",
  "competitor",
  "no_budget",
  "no_decision",
  "timing",
  "product_fit",
  "no_response",
  "other",
] as const;

type Copy = (typeof STEWARD_COPY)["ja"];

type PipelineDealRow = {
  id: string;
  title: string;
  stage: string;
  counterparty: string;
  next_action?: string;
  next_action_due?: string;
  lost_reason?: string;
};

export function CustomersWorkbenchPage({ view }: { view: CustomersWorkbenchView }) {
  const copy = useCopy(STEWARD_COPY);
  const [gate, setGate] = useState<CustomersNavGate | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const nav = await fetchCustomersNav();
      setGate(nav);
      if (!nav.show_tab) {
        setPayload(null);
        return;
      }
      if (view === "customers-outbound") {
        setPayload(await fetchCustomersOutbound());
      } else if (view === "customers-inbound") {
        setPayload(await fetchCustomersInbound());
      } else if (view === "customers-after-sales") {
        setPayload(await fetchCustomersAfterSales());
      } else if (view === "customers-pipeline") {
        setPayload(await fetchCustomersPipeline());
      } else if (view === "customers-accounts") {
        setPayload(await fetchCustomersAccounts());
      } else {
        setPayload(await fetchCustomersChurn());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [view]);

  useEffect(() => {
    void load();
  }, [load]);

  const title =
    view === "customers-outbound"
      ? copy.customersOutbound
      : view === "customers-inbound"
        ? copy.customersInbound
        : view === "customers-pipeline"
          ? copy.customersPipeline
          : view === "customers-accounts"
            ? copy.customersAccounts
            : view === "customers-after-sales"
              ? copy.customersAfterSales
              : copy.customersChurn;

  if (gate && !gate.show_tab) {
    return (
      <OpsPage title={copy.customers} lead={copy.customersLockedLead} className="customers-page">
        <p>
          <a href="/modules/">{copy.moduleList}</a>
        </p>
      </OpsPage>
    );
  }

  const locked = (payload as LockedPayload | null)?.locked === true;

  return (
    <OpsPage
      title={title}
      lead={copy.customersLead}
      loading={!gate && !error}
      loadingLabel={copy.loading}
      error={error}
      className="customers-page"
    >
      {gate?.sales_agent_grace && view.startsWith("customers-") && !gate.sales_module_installed ? (
        <p className="ops-card muted">{copy.customersSalesGrace}</p>
      ) : null}
      {locked ? (
        <section className="ops-card">
          <p>{(payload as LockedPayload).message ?? copy.customersModuleLocked}</p>
          <p>
            <a href="/modules/">{copy.moduleList}</a>
          </p>
        </section>
      ) : null}
      {!locked && payload ? (
        <CustomersPanel view={view} payload={payload} copy={copy} onReload={load} />
      ) : null}
      <p className="section-cta">
        <a href="/steward/" className="btn btn-ghost btn-sm">
          {copy.customersAskSteward}
        </a>
      </p>
    </OpsPage>
  );
}

function CustomersPanel({
  view,
  payload,
  copy,
  onReload,
}: {
  view: CustomersWorkbenchView;
  payload: unknown;
  copy: Copy;
  onReload: () => Promise<void>;
}) {
  if (view === "customers-outbound") {
    const data = payload as Awaited<ReturnType<typeof fetchCustomersOutbound>>;
    if (data.locked) return null;
    const { outbound, pipeline } = data as unknown as {
      outbound: {
        active_campaigns: number;
        total_campaigns: number;
        aggregate_coverage_pct?: number | null;
        alerts: Array<{ campaign_id: string; summary: string }>;
      };
      pipeline: {
        open_deals: number;
        weighted_pipeline_man: number;
        alerts: Array<{ deal_id: string; summary: string }>;
      };
    };
    return (
      <>
        <section className="ops-card">
          <h2 className="section-title">{copy.customersCampaigns}</h2>
          <p className="muted">
            {copy.customersActiveCampaigns(outbound.active_campaigns, outbound.total_campaigns)}
            {outbound.aggregate_coverage_pct != null
              ? ` · ${copy.customersCoverage(outbound.aggregate_coverage_pct)}`
              : ""}
          </p>
          {outbound.alerts.length > 0 ? (
            <ul>
              {outbound.alerts.slice(0, 8).map((a) => (
                <li key={a.campaign_id}>{a.summary}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">{copy.customersNoAlerts}</p>
          )}
        </section>
        <section className="ops-card">
          <h2 className="section-title">{copy.customersOpenDeals}</h2>
          <p className="muted">
            {copy.customersPipelineSummary(
              pipeline.open_deals,
              pipeline.weighted_pipeline_man,
            )}
          </p>
          {pipeline.alerts.length > 0 ? (
            <ul>
              {pipeline.alerts.slice(0, 8).map((a) => (
                <li key={a.deal_id}>{a.summary}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">{copy.customersNoAlerts}</p>
          )}
          <p className="section-actions">
            <a href="/customers/pipeline/" className="lf-card-link">
              {copy.customersEditInPipeline}
            </a>
          </p>
        </section>
      </>
    );
  }

  if (view === "customers-inbound") {
    return <InboundPanel payload={payload} copy={copy} onReload={onReload} />;
  }

  if (view === "customers-pipeline") {
    return <PipelinePanel payload={payload} copy={copy} onReload={onReload} />;
  }

  if (view === "customers-accounts") {
    const data = payload as Awaited<ReturnType<typeof fetchCustomersAccounts>>;
    if (data.locked) return null;
    const accounts =
      (data.view as { accounts?: Array<Record<string, unknown>> })?.accounts ?? [];
    const warnings =
      (data.view as { dedupe_warnings?: Array<{ message: string }> })?.dedupe_warnings ?? [];
    return (
      <>
        {warnings.length > 0 ? (
          <section className="ops-card muted">
            {warnings.map((w, i) => (
              <p key={i}>{w.message}</p>
            ))}
            <p className="muted">{copy.customersMergeCliHint}</p>
          </section>
        ) : null}
        <section className="ops-card">
          <h2 className="section-title">{copy.customersAccountsList}</h2>
          <ul>
            {accounts.map((a) => (
              <li key={String(a.id)}>
                {String(a.company)} — {String(a.lifecycle ?? "customer")}
                {typeof a.open_deals === "number" && a.open_deals > 0
                  ? ` · 商談 ${a.open_deals}`
                  : ""}
              </li>
            ))}
          </ul>
        </section>
      </>
    );
  }

  if (view === "customers-after-sales") {
    const data = payload as Awaited<ReturnType<typeof fetchCustomersAfterSales>>;
    if (data.locked) return null;
    const v = data.view as {
      total_accounts: number;
      by_health: { healthy: number; at_risk: number; critical: number };
      renewal_alerts: Array<{
        account_id: string;
        company: string;
        days_remaining: number;
        health: string;
      }>;
    };
    return (
      <>
        <section className="ops-card">
          <h2 className="section-title">{copy.customersHealth}</h2>
          <p className="muted">
            {copy.customersHealthSummary(
              v.total_accounts,
              v.by_health.healthy,
              v.by_health.at_risk,
              v.by_health.critical,
            )}
          </p>
        </section>
        {v.renewal_alerts.length > 0 ? (
          <section className="ops-card">
            <h2 className="section-title">{copy.customersRenewals}</h2>
            <ul>
              {v.renewal_alerts.slice(0, 8).map((r) => (
                <li key={r.account_id}>
                  {r.company} — {r.days_remaining}日 · {r.health}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </>
    );
  }

  const data = payload as Awaited<ReturnType<typeof fetchCustomersChurn>>;
  if (data.locked) return null;
  const v = data.view as {
    at_risk_count: number;
    critical_count: number;
    churned_count: number;
    dormant_count: number;
    accounts: Array<{ account_id: string; company: string; summary: string }>;
    recent_events: Array<{
      event_id: string;
      company: string;
      event_type: string;
      occurred_on: string;
    }>;
  };
  return (
    <>
      <section className="ops-card">
        <h2 className="section-title">{copy.customersChurnSummary}</h2>
        <p className="muted">
          {copy.customersChurnCounts(
            v.at_risk_count,
            v.critical_count,
            v.churned_count,
            v.dormant_count,
          )}
        </p>
        {v.accounts.length > 0 ? (
          <ul>
            {v.accounts.slice(0, 12).map((a) => (
              <li key={a.account_id}>
                {a.company} — {a.summary}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{copy.customersNoAlerts}</p>
        )}
      </section>
      {v.recent_events.length > 0 ? (
        <section className="ops-card">
          <h2 className="section-title">{copy.customersChurnEvents}</h2>
          <ul>
            {v.recent_events.slice(0, 8).map((e) => (
              <li key={e.event_id}>
                {e.company} — {e.event_type} ({e.occurred_on})
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function InboundPanel({
  payload,
  copy,
  onReload,
}: {
  payload: unknown;
  copy: Copy;
  onReload: () => Promise<void>;
}) {
  const data = payload as Awaited<ReturnType<typeof fetchCustomersInbound>> & {
    qualified_for_promote?: Array<{
      id: string;
      subject: string;
      company?: string;
      status: string;
    }>;
    ambiguous_mail_count?: number;
    mail_link_hint?: string;
  };
  if (data.locked) return null;
  const v = data.view as {
    open_inquiries: number;
    total_inquiries: number;
    alerts: Array<{ inquiry_id: string; summary: string }>;
  };
  const qualified = data.qualified_for_promote ?? [];
  const ambiguous = data.ambiguous_mail_count ?? 0;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <>
      <section className="ops-card">
        <h2 className="section-title">{copy.customersInquiryQueue}</h2>
        <p className="muted">
          {copy.customersInquirySummary(v.open_inquiries, v.total_inquiries)}
        </p>
        {ambiguous > 0 ? (
          <p className="muted">
            {copy.customersAmbiguousMail(ambiguous)}
            {data.mail_link_hint ? ` · ${data.mail_link_hint}` : ""}
          </p>
        ) : null}
        {v.alerts.length > 0 ? (
          <ul>
            {v.alerts.slice(0, 10).map((a) => (
              <li key={a.inquiry_id}>{a.summary}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">{copy.customersNoAlerts}</p>
        )}
      </section>
      {qualified.length > 0 ? (
        <section className="ops-card">
          <h2 className="section-title">{copy.customersQualifiedPromote}</h2>
          {msg ? <p className="muted">{msg}</p> : null}
          {err ? <p className="error">{err}</p> : null}
          <ul className="customers-deal-list">
            {qualified.map((inq) => (
              <li key={inq.id}>
                <strong>{inq.subject}</strong>
                {inq.company ? ` — ${inq.company}` : ""} · {inq.id}
                <p className="section-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busyId === inq.id}
                    onClick={() => {
                      void (async () => {
                        setBusyId(inq.id);
                        setErr(null);
                        setMsg(null);
                        try {
                          const r = await postCustomersInquiryPromote({
                            inquiry_id: inq.id,
                          });
                          setMsg(
                            r.deal_id
                              ? `${copy.customersPromoteDone} (${r.deal_id})`
                              : copy.customersPromoteDone,
                          );
                          await onReload();
                        } catch (e) {
                          setErr(e instanceof Error ? e.message : copy.customersActionError);
                        } finally {
                          setBusyId(null);
                        }
                      })();
                    }}
                  >
                    {copy.customersPromoteInquiry}
                  </button>
                  <a href="/customers/pipeline/" className="btn btn-ghost btn-sm">
                    {copy.customersEditInPipeline}
                  </a>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function PipelinePanel({
  payload,
  copy,
  onReload,
}: {
  payload: unknown;
  copy: Copy;
  onReload: () => Promise<void>;
}) {
  const data = payload as Awaited<ReturnType<typeof fetchCustomersPipeline>>;
  if (data.locked) return null;
  const deals =
    ((data.pipeline as { deals?: PipelineDealRow[] })?.deals ?? []) as PipelineDealRow[];
  const ambiguous =
    typeof (data as { ambiguous_mail_count?: number }).ambiguous_mail_count === "number"
      ? (data as unknown as { ambiguous_mail_count: number }).ambiguous_mail_count
      : 0;

  return (
    <section className="ops-card">
      <h2 className="section-title">{copy.customersPipelineDeals}</h2>
      {ambiguous > 0 ? (
        <p className="muted">{copy.customersAmbiguousMail(ambiguous)}</p>
      ) : null}
      <ul className="customers-deal-list">
        {deals.slice(0, 30).map((d) => (
          <DealOpsRow key={d.id} deal={d} copy={copy} onReload={onReload} />
        ))}
      </ul>
    </section>
  );
}

function DealOpsRow({
  deal,
  copy,
  onReload,
}: {
  deal: PipelineDealRow;
  copy: Copy;
  onReload: () => Promise<void>;
}) {
  const [stage, setStage] = useState(deal.stage);
  const [lostReason, setLostReason] = useState(deal.lost_reason ?? "other");
  const [nextAction, setNextAction] = useState(deal.next_action ?? "");
  const [nextDue, setNextDue] = useState(deal.next_action_due ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setStage(deal.stage);
    setLostReason(deal.lost_reason ?? "other");
    setNextAction(deal.next_action ?? "");
    setNextDue(deal.next_action_due ?? "");
  }, [deal.id, deal.stage, deal.lost_reason, deal.next_action, deal.next_action_due]);

  return (
    <li>
      <strong>{deal.title}</strong> — {deal.counterparty} · {deal.id}
      {err ? <p className="error">{err}</p> : null}
      <p className="customers-deal-ops">
        <label>
          {copy.customersSetStage}{" "}
          <select
            value={stage}
            disabled={busy}
            onChange={(e) => setStage(e.target.value)}
          >
            {DEAL_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {stage === "lost" ? (
          <label>
            {copy.customersLostReasonLabel}{" "}
            <select
              value={lostReason}
              disabled={busy}
              onChange={(e) => setLostReason(e.target.value)}
            >
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || stage === deal.stage}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setErr(null);
              try {
                await postCustomersDealSetStage({
                  deal_id: deal.id,
                  stage,
                  lost_reason: stage === "lost" ? lostReason : undefined,
                  reopen:
                    (deal.stage === "won" || deal.stage === "lost") &&
                    stage !== "won" &&
                    stage !== "lost",
                });
                await onReload();
              } catch (e) {
                setErr(e instanceof Error ? e.message : copy.customersActionError);
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {copy.customersSetStage}
        </button>
      </p>
      <p className="customers-deal-ops">
        <label>
          {copy.customersNextActionLabel}{" "}
          <input
            type="text"
            value={nextAction}
            disabled={busy}
            onChange={(e) => setNextAction(e.target.value)}
          />
        </label>
        <label>
          {copy.customersNextActionDueLabel}{" "}
          <input
            type="date"
            value={nextDue}
            disabled={busy}
            onChange={(e) => setNextDue(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !nextAction.trim()}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setErr(null);
              try {
                await postCustomersDealSetNextAction({
                  deal_id: deal.id,
                  next_action: nextAction.trim(),
                  next_action_due: nextDue || undefined,
                });
                await onReload();
              } catch (e) {
                setErr(e instanceof Error ? e.message : copy.customersActionError);
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {copy.customersSaveNextAction}
        </button>
      </p>
    </li>
  );
}
