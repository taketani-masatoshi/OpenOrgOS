import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchOrgBudget,
  isBudgetRevisionConflict,
  outlookInit,
  outlookProposeEnvelope,
  outlookPublish,
  outlookSetAsOf,
  outlookSetRemaining,
  outlookSyncYojitsu,
  setOrgCompanyBudget,
  type OrgBudgetPayload,
} from "./api";
import { useCopy } from "@ops-shared/define-copy";
import { useUiLocale } from "@ops-shared/useUiLocale";
import { dateTimeLocale } from "@ops-shared/locale";
import { STEWARD_COPY } from "./steward-copy";

type OutlookEnvelopeProposal = NonNullable<
  Awaited<ReturnType<typeof outlookProposeEnvelope>>["proposed_envelope"]
>;
import { OrgBudgetAllocation } from "./OrgBudgetAllocation";
import { OrgBudgetPeople } from "./OrgBudgetPeople";
import { PayrollLanePanel } from "./PayrollLanePanel";
import { WalletOpsPrompts } from "./WalletOpsRail";
import { formatBudgetHistoryEvent } from "./budgetHistoryLabels";
import { MonthPickerInput } from "./MonthPickerInput";
import {
  fingerprintFromBudget,
  publishBudgetMutation,
  readBudgetSyncRuntimeOptions,
  shouldSkipBudgetSyncReload,
  subscribeBudgetMutations,
} from "./budgetLiveSync";
import { createSubmitGuard, withRetry } from "./webGuards";
import {
  buildCompanyPayrollPrompts,
  shouldPollReloadWhileVisible,
} from "./walletOps";
import { getOrgBudgetSnapshot } from "./orgBudgetSnapshot";

type View = "people" | "overview" | "plans" | "outlook" | "payroll" | "sources" | "history";

function yen(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** `2026-07` → `7月` / `Jul` for denser month tables. */
function monthShortLabel(
  month: string,
  format: (n: number) => string,
): string {
  const m = month.match(/-(\d{2})$/)?.[1];
  if (!m) return month;
  return format(Number(m));
}

function signedYen(amount: number): string {
  if (amount > 0) return `+${yen(amount)}`;
  return yen(amount);
}

function planStatusLabel(
  planning: OrgBudgetPayload["planning"],
  copy: (typeof STEWARD_COPY)["ja"],
): string {
  if (planning.business_plan_status === "approved") {
    return planning.has_board_evidence ? copy.planApprovedFix : copy.planApproved;
  }
  if (planning.business_plan_status === "pending_approval") {
    return copy.planPending;
  }
  if (planning.business_plan_status === "draft") return copy.planDraft;
  return copy.unset;
}

function InfoTip({ label }: { label: string }) {
  return (
    <span className="info-tip" tabIndex={0}>
      <span className="info-tip-mark" aria-hidden="true">
        i
      </span>
      <span className="info-tip-pop" role="tooltip">
        {label}
      </span>
    </span>
  );
}


type PlanUnitGroup = OrgBudgetPayload["plan_reference"]["revenue_units"][number];

function PlanLineTable({
  lines,
  footerLabel,
  footerYen,
}: {
  lines: Array<{ id: string; name: string; amount_yen: number }>;
  footerLabel?: string;
  footerYen?: number;
}) {
  const copy = useCopy(STEWARD_COPY);
  return (
    <table className="plan-line-table">
      <thead>
        <tr>
          <th>{copy.colAccount}</th>
          <th>{copy.colAmount}</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={line.id}>
            <td>{line.name}</td>
            <td>{yen(line.amount_yen)}</td>
          </tr>
        ))}
      </tbody>
      {footerLabel != null && footerYen != null && (
        <tfoot>
          <tr>
            <th>{footerLabel}</th>
            <td>{yen(footerYen)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function CorporateExpenseTables({ unit }: { unit: PlanUnitGroup }) {
  const copy = useCopy(STEWARD_COPY);
  const groups = unit.line_groups ?? [];
  const officer = groups.find((g) => g.group_id === "officer_compensation");
  const personnel = groups.find((g) => g.group_id === "personnel");
  const other = groups.find((g) => g.group_id === "other");
  const personnelSubtotal = unit.personnel_subtotal_yen ?? 0;

  return (
    <div className="plan-corporate-sections">
      {officer && (
        <div className="plan-line-subgroup">
          <h4>{officer.label}</h4>
          <PlanLineTable
            lines={officer.lines}
            footerLabel={copy.subtotal}
            footerYen={officer.total_yen}
          />
        </div>
      )}
      {personnel && (
        <div className="plan-line-subgroup">
          <h4>{personnel.label}</h4>
          <PlanLineTable
            lines={personnel.lines}
            footerLabel={copy.subtotal}
            footerYen={personnel.total_yen}
          />
        </div>
      )}
      {(officer || personnel) && (
        <table className="plan-line-table plan-personnel-subtotal">
          <tfoot>
            <tr>
              <th>{copy.officerPayrollSubtotal}</th>
              <td>{yen(personnelSubtotal)}</td>
            </tr>
          </tfoot>
        </table>
      )}
      {other && (
        <div className="plan-line-subgroup">
          <h4>{other.label}</h4>
          <PlanLineTable
            lines={other.lines}
            footerLabel={copy.subtotal}
            footerYen={other.total_yen}
          />
        </div>
      )}
      <table className="plan-line-table">
        <tfoot>
          <tr>
            <th>{copy.corporateSubtotal}</th>
            <td>{yen(unit.total_yen)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function PlanUnitBreakdown({
  title,
  units,
  grandTotalYen,
  emptyLabel,
  corporateLabel,
}: {
  title: string;
  units: PlanUnitGroup[];
  grandTotalYen: number | null | undefined;
  emptyLabel: string;
  corporateLabel?: string;
}) {
  const copy = useCopy(STEWARD_COPY);
  const sharedLabel = corporateLabel ?? copy.corporateExpense;
  if (units.length === 0) {
    return (
      <div className="plan-line-card">
        <h3>{title}</h3>
        <p className="meta">{emptyLabel}</p>
      </div>
    );
  }

  const total =
    grandTotalYen ??
    units.reduce((sum, unit) => sum + unit.total_yen, 0);

  return (
    <div className="plan-line-card plan-unit-card">
      <h3>{title}</h3>
      <div className="plan-unit-groups">
        {units.map((unit) => (
          <div key={unit.business_unit_id} className="plan-unit-group">
            <div className="plan-unit-group-header">
              <div>
                <span className="plan-unit-kind">
                  {unit.is_corporate ? sharedLabel : copy.businessUnit}
                </span>
                <strong>{unit.label}</strong>
              </div>
              <span className="plan-unit-id">{unit.business_unit_id}</span>
            </div>
            {unit.is_corporate && (unit.line_groups?.length ?? 0) > 0 ? (
              <CorporateExpenseTables unit={unit} />
            ) : (
              <PlanLineTable
                lines={unit.lines}
                footerLabel={copy.subtotal}
                footerYen={unit.total_yen}
              />
            )}
          </div>
        ))}
      </div>
      <table className="plan-line-table plan-grand-total">
        <tfoot>
          <tr>
            <th>{copy.total}</th>
            <td>{yen(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function formatYenInput(value: string | number): string {
  const digits = String(value).replace(/[^0-9]/g, "");
  return digits ? Number(digits).toLocaleString("ja-JP") : "";
}

function parseYenInput(value: string): number {
  return Number(value.replaceAll(",", ""));
}

function CurrencyInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const copy = useCopy(STEWARD_COPY);
  return (
    <div className="currency-input">
      <span aria-hidden="true">¥</span>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        placeholder="0"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(formatYenInput(event.target.value))}
      />
      <span>{copy.yen}</span>
    </div>
  );
}

function BudgetHistoryList({ budget }: { budget: OrgBudgetPayload }) {
  const locale = useUiLocale();
  const accountNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of budget.company_categories ?? []) {
      map.set(row.account_code, row.account_name);
    }
    for (const row of budget.budget_categories ?? []) {
      map.set(row.account_code, row.account_name);
    }
    for (const dept of budget.departments ?? []) {
      for (const row of dept.categories) {
        map.set(row.account_code, row.account_name);
      }
    }
    return map;
  }, [budget.budget_categories, budget.company_categories, budget.departments]);

  const personNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const dept of budget.departments ?? []) {
      for (const member of dept.members) {
        map.set(member.person_id, member.display_name);
      }
      for (const person of dept.candidate_people) {
        map.set(person.person_id, person.display_name);
      }
    }
    return map;
  }, [budget.departments]);

  const operatorNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const op of budget.outlook_operators ?? []) {
      map.set(op.operator_id, op.display_name);
    }
    for (const dept of budget.departments ?? []) {
      if (dept.head_operator_id && dept.head_label) {
        map.set(dept.head_operator_id, dept.head_label);
      }
    }
    return map;
  }, [budget.departments, budget.outlook_operators]);

  return (
    <div className="event-list">
      {(budget.events ?? []).map((event) => {
        const { title, detail } = formatBudgetHistoryEvent(event, {
          formatYen: yen,
          orgUnitLabel: (id) =>
            budget.departments?.find((d) => d.org_unit_id === id)
              ?.org_unit_label,
          personLabel: (id) => personNames.get(id),
          operatorLabel: (id) => operatorNames.get(id),
          accountLabel: (code) => accountNames.get(code),
        }, { japanese: locale === "ja" });
        return (
          <article key={event.event_id}>
            <span className="event-mark" />
            <div>
              <strong>{title}</strong>
              <p>{detail}</p>
            </div>
            <time dateTime={event.occurred_at}>
              {new Intl.DateTimeFormat(dateTimeLocale(locale), {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(event.occurred_at))}
            </time>
          </article>
        );
      })}
    </div>
  );
}

export function OrgBudgetPanel({
  onError,
  onToast,
  onRetryReady,
}: {
  onError: (message: string | null) => void;
  onToast: (message: string) => void;
  /** App can show a Retry button that calls this. */
  onRetryReady?: (retry: (() => void) | null) => void;
}) {
  const copy = useCopy(STEWARD_COPY);
  const locale = useUiLocale();
  const [budget, setBudget] = useState<OrgBudgetPayload | null>(() =>
    getOrgBudgetSnapshot(),
  );
  const [view, setView] = useState<View>("people");
  const [hierarchyFocusUnit, setHierarchyFocusUnit] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [companyAmount, setCompanyAmount] = useState("");
  const [outlookPublisherId, setOutlookPublisherId] = useState("");
  const [outlookAsOf, setOutlookAsOf] = useState("");
  const [outlookMonth, setOutlookMonth] = useState("");
  const [outlookRevenue, setOutlookRevenue] = useState("");
  const [outlookOpex, setOutlookOpex] = useState("");
  const [outlookCapex, setOutlookCapex] = useState("");
  const [outlookMonthDetail, setOutlookMonthDetail] = useState(false);
  const [envelopeProposal, setEnvelopeProposal] =
    useState<OutlookEnvelopeProposal | null>(null);
  // One guard for all mutations — stops double-submit on button mash.
  const submitGuard = useMemo(() => createSubmitGuard(), []);
  const lastMutation = useRef<(() => Promise<void>) | null>(null);
  const budgetRef = useRef(budget);
  budgetRef.current = budget;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const [remoteSyncNotice, setRemoteSyncNotice] = useState<string | null>(null);
  const fetchedAtRef = useRef<number | null>(null);
  const pendingRemoteRef = useRef(false);

  const applyBudget = useCallback((next: OrgBudgetPayload) => {
    budgetRef.current = next;
    setBudget(next);
    fetchedAtRef.current = Date.now();
    if (next.summary) {
      setCompanyAmount(formatYenInput(next.summary.company_budget_yen));
    } else if (next.planning.baseline_yen != null) {
      setCompanyAmount(formatYenInput(next.planning.baseline_yen));
    }
    if (next.outlook_reference) {
      setOutlookAsOf((prev) => prev || next.outlook_reference.as_of_month);
      const editor = next.outlook_reference.last_edited_by_operator_id;
      const candidates = (next.outlook_operators ?? []).filter(
        (op) => op.operator_id !== editor,
      );
      setOutlookPublisherId((prev) => {
        if (prev && candidates.some((op) => op.operator_id === prev)) {
          return prev;
        }
        return candidates[0]?.operator_id ?? "";
      });
    }
  }, []);

  const reload = useCallback(async () => {
    setLoadFailed(false);
    onError(null);
    // Always load the active fiscal year. Year rollover is CLI-only; the
    // Console does not offer switching into unread/unusable envelopes.
    const next = await withRetry(() => fetchOrgBudget());
    applyBudget(next);
  }, [applyBudget, onError]);

  useEffect(() => {
    const snap = getOrgBudgetSnapshot();
    if (snap) applyBudget(snap);
    void reload().catch((error: unknown) => {
      setLoadFailed(true);
      onError(error instanceof Error ? error.message : String(error));
    });
  }, [applyBudget, onError, reload]);

  useEffect(() => {
    if (!onRetryReady) return;
    const retry = () => {
      const pending = lastMutation.current;
      if (pending) {
        void pending();
        return;
      }
      void reload().catch((error: unknown) => {
        setLoadFailed(true);
        onError(error instanceof Error ? error.message : String(error));
      });
    };
    onRetryReady(retry);
    return () => onRetryReady(null);
  }, [onError, onRetryReady, reload]);

  async function run(action: () => Promise<OrgBudgetPayload>, message: string) {
    const mutation = async () => {
      setBusy(true);
      busyRef.current = true;
      onError(null);
      try {
        const next = await action();
        applyBudget(next);
        publishBudgetMutation("admin", fingerprintFromBudget(next));
        lastMutation.current = null;
        const proposed = (
          next as OrgBudgetPayload & {
            proposed_envelope?: OutlookEnvelopeProposal;
          }
        ).proposed_envelope;
        if (proposed) {
          setEnvelopeProposal(proposed);
          onToast(
            copy.envelopeProposal(
              yen(proposed.suggested_company_budget_yen),
              proposed.current_company_budget_yen == null
                ? null
                : yen(proposed.current_company_budget_yen),
            ),
          );
          return;
        }
        onToast(next.proposed_approval?.message ?? message);
      } catch (error) {
        if (isBudgetRevisionConflict(error)) {
          const conflictMessage =
            copy.conflictOther;
          try {
            // Refresh tokens into shared budgetRef (People/Allocation read
            // budgetLiveRef), then retry once before React re-renders children.
            setLoadFailed(false);
            const refreshed = await withRetry(() => fetchOrgBudget());
            applyBudget(refreshed);
            try {
              const retried = await action();
              applyBudget(retried);
              publishBudgetMutation("admin", fingerprintFromBudget(retried));
              lastMutation.current = null;
              onToast(copy.retriedLatest(message));
              return;
            } catch (retryError) {
              if (isBudgetRevisionConflict(retryError)) {
                lastMutation.current = null;
                onError(conflictMessage);
                return;
              }
              throw retryError;
            }
          } catch (reloadError: unknown) {
            lastMutation.current = null;
            onError(
              reloadError instanceof Error
                ? reloadError.message
                : String(reloadError),
            );
          }
          return;
        }
        onError(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
        busyRef.current = false;
        if (pendingRemoteRef.current) {
          pendingRemoteRef.current = false;
          void withRetry(() => fetchOrgBudget())
            .then((next) => {
              applyBudget(next);
              setRemoteSyncNotice(copy.syncFromOther);
            })
            .catch(() => {
              /* next poll */
            });
        }
      }
    };
    lastMutation.current = mutation;
    await submitGuard.run(mutation);
  }

  useEffect(() => {
    if (!remoteSyncNotice) return;
    const id = window.setTimeout(() => setRemoteSyncNotice(null), 6_000);
    return () => window.clearTimeout(id);
  }, [remoteSyncNotice]);

  useEffect(() => {
    const syncOpts = readBudgetSyncRuntimeOptions();

    async function softReloadFromRemote(notice: string) {
      if (busyRef.current) {
        pendingRemoteRef.current = true;
        return;
      }
      try {
        const next = await withRetry(() => fetchOrgBudget());
        applyBudget(next);
        setRemoteSyncNotice(notice);
      } catch {
        // Keep existing UI; next poll / focus can retry.
      }
    }

    const unsubscribe = subscribeBudgetMutations((message) => {
      const current = budgetRef.current
        ? fingerprintFromBudget(budgetRef.current)
        : {};
      if (shouldSkipBudgetSyncReload(message, current)) return;
      const notice =
        message.source === "admin"
          ? copy.syncFromOther
          : copy.syncBudgetUpdated;
      void softReloadFromRemote(notice);
    });

    const pollMinAgeMs = Math.min(30_000, Math.max(250, syncOpts.pollMs / 2));
    const pollId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (busyRef.current) return;
      if (
        !shouldPollReloadWhileVisible(
          fetchedAtRef.current,
          Date.now(),
          pollMinAgeMs,
        )
      ) {
        return;
      }
      void softReloadFromRemote(copy.syncReloaded);
    }, syncOpts.pollMs);

    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      if (pendingRemoteRef.current) {
        pendingRemoteRef.current = false;
        void softReloadFromRemote(copy.syncFromOther);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsubscribe();
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [applyBudget, copy]);

  if (!budget && !loadFailed) {
    return <div className="loading-panel">{copy.budgetValidating}</div>;
  }

  if (!budget && loadFailed) {
    return (
      <section className="empty-panel">
        <h2>{copy.budgetLoadFailed}</h2>
        <p className="meta">{copy.budgetLoadHint}</p>
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() =>
            void reload().catch((error: unknown) => {
              setLoadFailed(true);
              onError(error instanceof Error ? error.message : String(error));
            })
          }
        >
          {copy.retry}
        </button>
      </section>
    );
  }

  if (!budget) {
    return <div className="loading-panel">{copy.budgetValidating}</div>;
  }

  const activeFy =
    budget.active_fiscal_year ??
    budget.fiscal_year ??
    budget.available_fiscal_years?.[0];
  // Mutations only against the active envelope (API may still expose ?fy=).
  const fyMutable = budget.fy_is_active !== false;
  const mutationBusy = busy || !fyMutable;

  if (!budget.initialized || !budget.summary) {
    return (
      <section className="empty-panel">
        <h2 className="heading-with-info">
          <span>{copy.companyUnset}</span>
          <InfoTip label={copy.companyUnsetTip} />
        </h2>
        <div className="baseline-strip setup-baseline">
          <div>
            <span>{copy.expenseBudget}</span>
            <strong>
              {budget.plan_reference.expense_plan_yen == null &&
              budget.planning.baseline_yen == null
                ? copy.unset
                : yen(
                    budget.plan_reference.expense_plan_yen ??
                      budget.planning.baseline_yen ??
                      0,
                  )}
            </strong>
          </div>
          <div>
            <span>{copy.revenueBudget}</span>
            <strong>
              {budget.plan_reference.revenue_plan_yen == null
                ? copy.unset
                : yen(budget.plan_reference.revenue_plan_yen)}
            </strong>
          </div>
          <p>{planStatusLabel(budget.planning, copy)}</p>
        </div>
        {budget.viewer.can_set_company && (
          <div className="company-setup">
            <CurrencyInput
              label={copy.companyBudgetYen}
              value={companyAmount}
              disabled={mutationBusy}
              onChange={setCompanyAmount}
            />
            <button
              className="primary-button"
              type="button"
              disabled={mutationBusy || parseYenInput(companyAmount) <= 0}
              onClick={() =>
                void run(
                  () =>
                    setOrgCompanyBudget({
                      amount_yen: parseYenInput(companyAmount),
                      fiscal_year: activeFy,
                      expected_revision: budgetRef.current?.revision,
                    }),
                  copy.companyBudgetSet,
                )
              }
            >
              {copy.startFromPlan}
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      {activeFy && (
        <p className="budget-fy-label" aria-label={copy.fiscalYear}>
          {activeFy}
          {budget.revision && budget.revision !== "0" ? (
            <span className="budget-revision-token" title={copy.revisionTitle}>
              {" "}
              · rev {budget.revision}
            </span>
          ) : null}
        </p>
      )}
      {remoteSyncNotice ? (
        <div
          className="wallet-sync-banner"
          role="status"
          aria-live="polite"
          data-testid="admin-sync-banner"
        >
          <span>{remoteSyncNotice}</span>
          <button
            type="button"
            className="wallet-ghost-btn"
            onClick={() => setRemoteSyncNotice(null)}
          >
            {copy.close}
          </button>
        </div>
      ) : null}
      <nav className="view-tabs" aria-label={copy.budgetView}>
        {(
          [
            ["people", copy.budgetPeople],
            ["overview", copy.budgetOverview],
            ["plans", copy.budgetPlans],
            ["outlook", copy.budgetOutlook],
            ["payroll", copy.budgetPayroll],
            ["sources", copy.budgetSources],
            ["history", copy.budgetHistory],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={view === id ? "active" : ""}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {view === "people" && (
        <OrgBudgetPeople
          budget={budget}
          budgetLiveRef={budgetRef}
          busy={mutationBusy}
          onRun={run}
          onOpenHierarchy={(orgUnitId) => {
            setHierarchyFocusUnit(orgUnitId ?? null);
            setView("overview");
          }}
        />
      )}

      {view === "overview" && (
        <OrgBudgetAllocation
          budget={budget}
          budgetLiveRef={budgetRef}
          busy={mutationBusy}
          onRun={run}
          initialOrgUnitId={hierarchyFocusUnit}
          onInitialOrgUnitConsumed={() => setHierarchyFocusUnit(null)}
        />
      )}

      {view === "outlook" && budget.outlook_reference && (
        <section className="plan-reference-panel outlook-panel">
          <div className="section-heading">
            <div>
              <h2>{copy.midOutlook}</h2>
            </div>
          </div>
          <section className="outlook-kpi">
            <div className="outlook-kpi-main">
              <span className="outlook-kpi-label">
                {copy.outlookOpex}
                <InfoTip
                  label={copy.outlookProfitTip(
                    yen(budget.outlook_reference.outlook.operating_profit_proxy_yen),
                  )}
                />
              </span>
              <strong>
                {yen(budget.outlook_reference.outlook.opex_yen)}
              </strong>
              <p className="outlook-kpi-sub">
                {copy.plan}{" "}
                {yen(budget.outlook_reference.plan.opex_yen)}
                {" · "}
                {copy.outlookActualThrough(
                  monthShortLabel(budget.outlook_reference.as_of_month, copy.monthShort),
                )}{" "}
                {yen(budget.outlook_reference.actual_ytd.opex_yen)}
              </p>
            </div>
            <div
              className={
                budget.outlook_reference.gaps.drift_alert
                  ? "outlook-kpi-delta is-alert"
                  : "outlook-kpi-delta"
              }
            >
              <span>
                {copy.vsPlan}
                <InfoTip label={copy.vsPlanTip} />
              </span>
              <strong>
                {signedYen(
                  budget.outlook_reference.gaps.outlook_vs_plan_opex_yen,
                )}
              </strong>
            </div>
          </section>
          {budget.outlook_reference.gaps.envelope_alert && (
            <p className="outlook-status-note" role="status">
              {copy.outlookOverEnvelope}
            </p>
          )}
          {budget.outlook_reference.department_consistency.alert && (
            <p className="outlook-status-note" role="status">
              {copy.deptOutlookGap(
                yen(budget.outlook_reference.department_consistency.delta_yen),
              )}
            </p>
          )}

          <div className="outlook-month-head">
            <h3 className="alloc-section-title">{copy.monthlyOpex}</h3>
            <label className="outlook-month-toggle">
              <input
                type="checkbox"
                checked={outlookMonthDetail}
                onChange={(event) =>
                  setOutlookMonthDetail(event.target.checked)
                }
              />
              {copy.showMoreMonths}
            </label>
          </div>
          <div
            className={
              outlookMonthDetail
                ? "category-table outlook-month-table is-detailed"
                : "category-table outlook-month-table"
            }
          >
            <div className="outlook-month-scroll">
              <div className="category-table-head">
                <span>{copy.colMonth}</span>
                <span>
                  {copy.colRole}
                  <InfoTip label={copy.roleTip} />
                </span>
                <span>{copy.opex}</span>
                {outlookMonthDetail && (
                  <>
                    <span>{copy.revenue}</span>
                    <span>{copy.capex}</span>
                    <span>{copy.depreciation}</span>
                  </>
                )}
              </div>
              {budget.outlook_reference.months.map((row) => (
                <div className="category-table-row" key={row.month}>
                  <strong title={row.month}>
                    {monthShortLabel(row.month, copy.monthShort)}
                  </strong>
                  <span>
                    {row.role === "actual" || row.role === "actual_missing"
                      ? copy.actual
                      : copy.forecast}
                  </span>
                  <span>{yen(row.opex_yen)}</span>
                  {outlookMonthDetail && (
                    <>
                      <span>{yen(row.revenue_yen)}</span>
                      <span>{yen(row.capex_yen)}</span>
                      <span>{yen(row.depreciation_yen)}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          {budget.outlook_reference.department_outlook.length > 0 && (
            <>
              <h3 className="alloc-section-title">{copy.deptOutlook}</h3>
              <div className="category-table reference-category-table">
                <div className="category-table-head">
                  <span>{copy.department}</span>
                  <span>{copy.deptOutlookOpex}</span>
                </div>
                {budget.outlook_reference.department_outlook.map((row) => {
                  const label =
                    budget.departments?.find(
                      (d) => d.org_unit_id === row.org_unit_id,
                    )?.org_unit_label ?? row.org_unit_id;
                  return (
                    <div className="category-table-row" key={row.org_unit_id}>
                      <strong>{label}</strong>
                      <span>{yen(row.opex_yen)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <details className="outlook-edit-details">
            <summary>{copy.editForecast}</summary>
            <div className="outlook-actions">
              {!budget.outlook_reference.file_exists && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={mutationBusy}
                  onClick={() =>
                    void run(
                      () =>
                        outlookInit({
                          fiscal_year:
                            budget.outlook_reference.fiscal_year,
                          expected_outlook_revision:
                            budgetRef.current?.outlook_reference.revision ?? "0",
                        }),
                      copy.outlookInited,
                    )
                  }
                >
                  {copy.init}
                </button>
              )}
              {budget.outlook_reference.file_exists && (
                <>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={mutationBusy}
                    onClick={() =>
                      void run(
                        () =>
                          outlookSyncYojitsu({
                            fiscal_year:
                              budget.outlook_reference.fiscal_year,
                            expected_outlook_revision:
                              budgetRef.current?.outlook_reference.revision ?? "0",
                          }),
                        copy.outlookSynced,
                      )
                    }
                  >
                    {copy.syncFromYojitsu}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={mutationBusy}
                    onClick={() =>
                      void run(
                        () =>
                          outlookProposeEnvelope({
                            fiscal_year:
                              budget.outlook_reference.fiscal_year,
                          }),
                        copy.proposalComputed,
                      )
                    }
                  >
                    {copy.proposal}
                  </button>
                </>
              )}
            </div>
            {envelopeProposal && (
              <p className="outlook-status-note" role="status">
                {copy.proposalNote(
                  yen(envelopeProposal.suggested_company_budget_yen),
                  envelopeProposal.current_company_budget_yen == null
                    ? "—"
                    : yen(envelopeProposal.current_company_budget_yen),
                  envelopeProposal.delta_yen == null
                    ? "—"
                    : signedYen(envelopeProposal.delta_yen),
                )}
              </p>
            )}
            {budget.outlook_reference.file_exists && (
              <div className="outlook-edit-forms">
                <form
                  className="outlook-form-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const asOf = outlookAsOf.trim();
                    if (!asOf) {
                      onError(copy.needAsOf);
                      return;
                    }
                    void run(
                      () =>
                        outlookSetAsOf({
                          as_of_month: asOf,
                          fiscal_year: budget.outlook_reference.fiscal_year,
                          expected_outlook_revision:
                            budgetRef.current?.outlook_reference.revision ?? "0",
                        }),
                      copy.asOfUpdated(asOf),
                    );
                  }}
                >
                  <label>
                    <span className="outlook-field-label">
                      {copy.asOfMonth}
                      <InfoTip label={copy.asOfTip} />
                    </span>
                    <MonthPickerInput
                      aria-label={copy.asOfMonth}
                      value={outlookAsOf}
                      onChange={setOutlookAsOf}
                      disabled={mutationBusy}
                      months={budget.outlook_reference.months.map(
                        (row) => row.month,
                      )}
                    />
                  </label>
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={mutationBusy}
                  >
                    {copy.refresh}
                  </button>
                </form>
                <form
                  className="outlook-form-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const month = outlookMonth.trim();
                    if (!month) {
                      onError(copy.needTargetMonth);
                      return;
                    }
                    void run(
                      () =>
                        outlookSetRemaining({
                          month,
                          fiscal_year: budget.outlook_reference.fiscal_year,
                          revenue_yen: Number(outlookRevenue || 0),
                          opex_yen: Number(outlookOpex || 0),
                          capex_yen: Number(outlookCapex || 0),
                          expected_outlook_revision:
                            budgetRef.current?.outlook_reference.revision ?? "0",
                        }),
                      copy.monthSaved(month),
                    );
                  }}
                >
                  <label>
                    <span className="outlook-field-label">
                      {copy.targetMonth}
                      <InfoTip label={copy.targetMonthTip} />
                    </span>
                    <MonthPickerInput
                      aria-label={copy.targetMonth}
                      value={outlookMonth}
                      onChange={setOutlookMonth}
                      disabled={mutationBusy}
                      months={budget.outlook_reference.months
                        .filter(
                          (row) =>
                            row.role === "outlook" ||
                            row.role === "plan_fallback",
                        )
                        .map((row) => row.month)}
                    />
                  </label>
                  <label>
                    {copy.revenue}
                    <input
                      inputMode="numeric"
                      value={outlookRevenue}
                      onChange={(e) => setOutlookRevenue(e.target.value)}
                      disabled={mutationBusy}
                      placeholder="0"
                    />
                  </label>
                  <label>
                    {copy.opex}
                    <input
                      inputMode="numeric"
                      value={outlookOpex}
                      onChange={(e) => setOutlookOpex(e.target.value)}
                      disabled={mutationBusy}
                      placeholder="0"
                    />
                  </label>
                  <label>
                    {copy.capex}
                    <input
                      inputMode="numeric"
                      value={outlookCapex}
                      onChange={(e) => setOutlookCapex(e.target.value)}
                      disabled={mutationBusy}
                      placeholder="0"
                    />
                  </label>
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={mutationBusy}
                  >
                    {copy.save}
                  </button>
                </form>
                <form
                  className="outlook-form-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!outlookPublisherId.trim()) {
                      onError(copy.needApprover);
                      return;
                    }
                    void run(
                      () =>
                        outlookPublish({
                          fiscal_year: budget.outlook_reference.fiscal_year,
                          publisher_operator_id: outlookPublisherId.trim(),
                          expected_outlook_revision:
                            budgetRef.current?.outlook_reference.revision ?? "0",
                        }),
                      copy.outlookPublished,
                    );
                  }}
                >
                  <label>
                    <span className="outlook-field-label">
                      {copy.publisher}
                      <InfoTip label={copy.publisherTip} />
                    </span>
                    <select
                      value={outlookPublisherId}
                      onChange={(e) => setOutlookPublisherId(e.target.value)}
                      disabled={mutationBusy}
                    >
                      <option value="">{copy.selectPlease}</option>
                      {(budget.outlook_operators ?? [])
                        .filter(
                          (op) =>
                            op.operator_id !==
                            budget.outlook_reference.last_edited_by_operator_id,
                        )
                        .map((op) => (
                          <option key={op.operator_id} value={op.operator_id}>
                            {op.display_name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={
                      mutationBusy ||
                      !outlookPublisherId ||
                      (budget.outlook_operators ?? []).every(
                        (op) =>
                          op.operator_id ===
                          budget.outlook_reference.last_edited_by_operator_id,
                      )
                    }
                  >
                    {copy.publish}
                  </button>
                </form>
                {(budget.outlook_operators ?? []).filter(
                  (op) =>
                    op.operator_id !==
                    budget.outlook_reference.last_edited_by_operator_id,
                ).length === 0 && (
                  <p className="outlook-status-note" role="status">
                    {copy.noOtherApprover}
                  </p>
                )}
              </div>
            )}
          </details>
        </section>
      )}

      {view === "plans" && (
        <section className="plan-reference-panel">
          <div className="section-heading">
            <div>
              <h2 className="heading-with-info">
                <span>{copy.businessPlan}</span>
                <InfoTip label={copy.businessPlanTip} />
              </h2>
            </div>
            <span>
              {budget.plan_reference.fiscal_year}
              {budget.plan_reference.period_from &&
              budget.plan_reference.period_to
                ? ` · ${budget.plan_reference.period_from}〜${budget.plan_reference.period_to}`
                : ""}
            </span>
          </div>
          <section className="summary-grid">
            <article className="summary-card featured">
              <span className="heading-with-info">
                {copy.revenue}
                <InfoTip
                  label={`${copy.businessPlanAmount(
                    budget.plan_reference.business_plan_revenue_yen == null
                      ? "—"
                      : yen(budget.plan_reference.business_plan_revenue_yen),
                  )}${
                    budget.plan_reference.consistency
                      .revenue_matches_business_plan === false
                      ? copy.mismatch
                      : ""
                  }`}
                />
              </span>
              <strong>
                {budget.plan_reference.revenue_plan_yen == null
                  ? "—"
                  : yen(budget.plan_reference.revenue_plan_yen)}
              </strong>
            </article>
            <article className="summary-card">
              <span className="heading-with-info">
                {copy.opex}
                <InfoTip
                  label={`${copy.sgaPlan(
                    budget.plan_reference.profit_plan_sga_yen == null
                      ? "—"
                      : yen(budget.plan_reference.profit_plan_sga_yen),
                  )}${
                    budget.plan_reference.consistency
                      .expense_matches_profit_sga === false
                      ? copy.mismatch
                      : ""
                  }`}
                />
              </span>
              <strong>
                {budget.plan_reference.expense_plan_yen == null
                  ? "—"
                  : yen(budget.plan_reference.expense_plan_yen)}
              </strong>
            </article>
            <article className="summary-card">
              <span className="heading-with-info">
                {copy.operatingProfit}
                <InfoTip label={copy.operatingProfitTip} />
              </span>
              <strong>
                {budget.plan_reference.business_plan_operating_profit_yen ==
                null
                  ? "—"
                  : yen(
                      budget.plan_reference.business_plan_operating_profit_yen,
                    )}
              </strong>
            </article>
            <article className="summary-card">
              <span>{copy.capexEquipment}</span>
              <strong>
                {budget.plan_reference.business_plan_investment_yen == null
                  ? "—"
                  : yen(budget.plan_reference.business_plan_investment_yen)}
              </strong>
            </article>
          </section>

          <div className="plan-line-stack">
            <PlanUnitBreakdown
              title={copy.revenueBreakdown}
              units={budget.plan_reference.revenue_units ?? []}
              grandTotalYen={budget.plan_reference.revenue_plan_yen}
              emptyLabel={copy.none}
            />
            <PlanUnitBreakdown
              title={copy.expenseBreakdown}
              units={budget.plan_reference.expense_units ?? []}
              grandTotalYen={budget.plan_reference.expense_plan_yen}
              emptyLabel={copy.none}
              corporateLabel={copy.corporateCommon}
            />
          </div>
        </section>
      )}

      {view === "payroll" && (
        <section className="plan-reference-panel payroll-tab" aria-label={copy.budgetPayroll}>
          {budget.payroll_reference ? (
            <WalletOpsPrompts
              scope="admin-payroll"
              prompts={buildCompanyPayrollPrompts({
                ok: budget.payroll_reference.ok,
                expected_monthly_yen:
                  budget.payroll_reference.expected_monthly_yen,
                actual_months: budget.payroll_reference.actual_months,
                empty_actual_months:
                  budget.payroll_reference.empty_actual_months,
                actual_variance_yen:
                  budget.payroll_reference.actual_variance_yen,
                actual_as_of: budget.actuals?.actual_as_of,
              }, locale)}
            />
          ) : null}
          <PayrollLanePanel
            mode="company"
            payroll={budget.payroll_reference}
          />
        </section>
      )}

      {view === "sources" && (
        <section className="source-panel">
          <div className="section-heading">
            <div>
              <h2 className="heading-with-info">
                <span>{copy.budgetSources}</span>
                <InfoTip label={copy.sourcesTip} />
              </h2>
            </div>
            <button
              type="button"
              className="quiet-button"
              onClick={() => void reload()}
            >
              {copy.refresh}
            </button>
          </div>
          <div className="source-list">
            {(budget.sources ?? []).map((source) => (
              <article key={source.path} title={source.detail}>
                <span className={`status-dot ${source.status}`} />
                <div>
                  <strong>{source.label}</strong>
                  <code>{source.path}</code>
                </div>
                <div className="source-meta">
                  <span>{copy.recordCount(source.record_count)}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {view === "history" && (
        <section className="history-panel">
          <div className="section-heading">
            <div>
              <h2>{copy.budgetHistory}</h2>
            </div>
            <span>{budget.events?.length ?? 0}</span>
          </div>
          {(budget.events?.length ?? 0) === 0 ? (
            <p className="empty-copy">{copy.noHistory}</p>
          ) : (
            <BudgetHistoryList budget={budget} />
          )}
        </section>
      )}
    </>
  );
}
