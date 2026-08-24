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

type View = "people" | "overview" | "plans" | "outlook" | "payroll" | "sources" | "history";

function yen(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** `2026-07` → `7月` for denser month tables. */
function monthShortLabel(month: string): string {
  const m = month.match(/-(\d{2})$/)?.[1];
  if (!m) return month;
  return `${Number(m)}月`;
}

function signedYen(amount: number): string {
  if (amount > 0) return `+${yen(amount)}`;
  return yen(amount);
}

function planStatusLabel(planning: OrgBudgetPayload["planning"]): string {
  if (planning.business_plan_status === "approved") {
    return planning.has_board_evidence ? "承認済み・FIX" : "承認済み";
  }
  if (planning.business_plan_status === "pending_approval") {
    return "承認待ち";
  }
  if (planning.business_plan_status === "draft") return "草案";
  return "未設定";
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
  return (
    <table className="plan-line-table">
      <thead>
        <tr>
          <th>科目</th>
          <th>金額</th>
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
            footerLabel="小計"
            footerYen={officer.total_yen}
          />
        </div>
      )}
      {personnel && (
        <div className="plan-line-subgroup">
          <h4>{personnel.label}</h4>
          <PlanLineTable
            lines={personnel.lines}
            footerLabel="小計"
            footerYen={personnel.total_yen}
          />
        </div>
      )}
      {(officer || personnel) && (
        <table className="plan-line-table plan-personnel-subtotal">
          <tfoot>
            <tr>
              <th>役員報酬・人件費 小計</th>
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
            footerLabel="小計"
            footerYen={other.total_yen}
          />
        </div>
      )}
      <table className="plan-line-table">
        <tfoot>
          <tr>
            <th>全社統括 小計</th>
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
  corporateLabel = "全社共通経費",
}: {
  title: string;
  units: PlanUnitGroup[];
  grandTotalYen: number | null | undefined;
  emptyLabel: string;
  corporateLabel?: string;
}) {
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
                  {unit.is_corporate ? corporateLabel : "事業ユニット"}
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
                footerLabel="小計"
                footerYen={unit.total_yen}
              />
            )}
          </div>
        ))}
      </div>
      <table className="plan-line-table plan-grand-total">
        <tfoot>
          <tr>
            <th>合計</th>
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
      <span>円</span>
    </div>
  );
}

function BudgetHistoryList({ budget }: { budget: OrgBudgetPayload }) {
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
        });
        return (
          <article key={event.event_id}>
            <span className="event-mark" />
            <div>
              <strong>{title}</strong>
              <p>{detail}</p>
            </div>
            <time dateTime={event.occurred_at}>
              {new Intl.DateTimeFormat("ja-JP", {
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
  const [budget, setBudget] = useState<OrgBudgetPayload | null>(null);
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
    void reload().catch((error: unknown) => {
      setLoadFailed(true);
      onError(error instanceof Error ? error.message : String(error));
    });
  }, [onError, reload]);

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
            `枠提案 ${yen(proposed.suggested_company_budget_yen)}` +
              (proposed.current_company_budget_yen == null
                ? ""
                : `（現行 ${yen(proposed.current_company_budget_yen)}）`),
          );
          return;
        }
        onToast(next.proposed_approval?.message ?? message);
      } catch (error) {
        if (isBudgetRevisionConflict(error)) {
          const conflictMessage =
            "他の操作者が先に更新しました。最新を再取得しました。内容を確認して再度操作してください。";
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
              onToast(`${message}（最新を取得して再試行しました）`);
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
              setRemoteSyncNotice("他画面の予算更新を反映しました");
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
          ? "他画面の予算更新を反映しました"
          : "予算データが更新されました";
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
      void softReloadFromRemote("最新の予算を再取得しました");
    }, syncOpts.pollMs);

    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      if (pendingRemoteRef.current) {
        pendingRemoteRef.current = false;
        void softReloadFromRemote("他画面の予算更新を反映しました");
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsubscribe();
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [applyBudget]);

  if (!budget && !loadFailed) {
    return <div className="loading-panel">予算正本を検証しています…</div>;
  }

  if (!budget && loadFailed) {
    return (
      <section className="empty-panel">
        <h2>予算データの読込に失敗しました</h2>
        <p className="meta">ネットワークや認証を確認し、再試行してください。</p>
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
          再試行
        </button>
      </section>
    );
  }

  if (!budget) {
    return <div className="loading-panel">予算正本を検証しています…</div>;
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
          <span>全社予算が未設定</span>
          <InfoTip label="年度と全社枠を登録すると開始できます。" />
        </h2>
        <div className="baseline-strip setup-baseline">
          <div>
            <span>経費予算</span>
            <strong>
              {budget.plan_reference.expense_plan_yen == null &&
              budget.planning.baseline_yen == null
                ? "未設定"
                : yen(
                    budget.plan_reference.expense_plan_yen ??
                      budget.planning.baseline_yen ??
                      0,
                  )}
            </strong>
          </div>
          <div>
            <span>売上予算</span>
            <strong>
              {budget.plan_reference.revenue_plan_yen == null
                ? "未設定"
                : yen(budget.plan_reference.revenue_plan_yen)}
            </strong>
          </div>
          <p>{planStatusLabel(budget.planning)}</p>
        </div>
        {budget.viewer.can_set_company && (
          <div className="company-setup">
            <CurrencyInput
              label="全社予算（円）"
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
                  "全社予算を設定しました",
                )
              }
            >
              事業計画基準で開始
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      {activeFy && (
        <p className="budget-fy-label" aria-label="会計年度">
          {activeFy}
          {budget.revision && budget.revision !== "0" ? (
            <span className="budget-revision-token" title="楽観的同時実行トークン">
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
            閉じる
          </button>
        </div>
      ) : null}
      <nav className="view-tabs" aria-label="予算ビュー">
        {(
          [
            ["people", "個人配布"],
            ["overview", "階層分配"],
            ["plans", "事業計画"],
            ["outlook", "見通し"],
            ["payroll", "人件費"],
            ["sources", "正本"],
            ["history", "履歴"],
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
              <h2>期中見通し</h2>
            </div>
          </div>
          <section className="outlook-kpi">
            <div className="outlook-kpi-main">
              <span className="outlook-kpi-label">
                見通し（経費）
                <InfoTip
                  label={`利益の目安 ${yen(budget.outlook_reference.outlook.operating_profit_proxy_yen)}（売上 − 経費 − 減価償却）`}
                />
              </span>
              <strong>
                {yen(budget.outlook_reference.outlook.opex_yen)}
              </strong>
              <p className="outlook-kpi-sub">
                計画{" "}
                {yen(budget.outlook_reference.plan.opex_yen)}
                {" · "}
                実績（〜{monthShortLabel(budget.outlook_reference.as_of_month)}
                ）{" "}
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
                計画との差
                <InfoTip label="見通しの経費 − 承認済み計画の経費。プラスは計画超過の見込みです。" />
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
              見通しの経費が執行枠を超えています。枠の変更は「階層分配」タブ。
            </p>
          )}
          {budget.outlook_reference.department_consistency.alert && (
            <p className="outlook-status-note" role="status">
              部門合計と全社見通しにずれ（差{" "}
              {yen(budget.outlook_reference.department_consistency.delta_yen)}
              ）。
            </p>
          )}

          <div className="outlook-month-head">
            <h3 className="alloc-section-title">月次（経費）</h3>
            <label className="outlook-month-toggle">
              <input
                type="checkbox"
                checked={outlookMonthDetail}
                onChange={(event) =>
                  setOutlookMonthDetail(event.target.checked)
                }
              />
              売上・投資・減価も表示
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
                <span>月</span>
                <span>
                  区分
                  <InfoTip label="「確定実績」はすでに確定した月、「見込み」は残月の予測です。" />
                </span>
                <span>経費</span>
                {outlookMonthDetail && (
                  <>
                    <span>売上</span>
                    <span>投資</span>
                    <span>減価</span>
                  </>
                )}
              </div>
              {budget.outlook_reference.months.map((row) => (
                <div className="category-table-row" key={row.month}>
                  <strong title={row.month}>
                    {monthShortLabel(row.month)}
                  </strong>
                  <span>
                    {row.role === "actual" || row.role === "actual_missing"
                      ? "実績"
                      : "見込み"}
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
              <h3 className="alloc-section-title">部門の見通し（経費）</h3>
              <div className="category-table reference-category-table">
                <div className="category-table-head">
                  <span>部門</span>
                  <span>経費見通し</span>
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
            <summary>見込み編集</summary>
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
                      "見通しを初期化しました",
                    )
                  }
                >
                  初期化
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
                        "残月を予実から同期しました（公開し直してください）",
                      )
                    }
                  >
                    予実から同期
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
                        "枠提案を計算しました",
                      )
                    }
                  >
                    枠提案
                  </button>
                </>
              )}
            </div>
            {envelopeProposal && (
              <p className="outlook-status-note" role="status">
                枠提案{" "}
                {yen(envelopeProposal.suggested_company_budget_yen)}
                （現行{" "}
                {envelopeProposal.current_company_budget_yen == null
                  ? "—"
                  : yen(envelopeProposal.current_company_budget_yen)}
                {" · "}
                差{" "}
                {envelopeProposal.delta_yen == null
                  ? "—"
                  : signedYen(envelopeProposal.delta_yen)}
                ）。自動では変わりません。変更は「階層分配」タブ。
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
                      onError("基準月を入力してください");
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
                      `基準月を ${asOf} に更新しました`,
                    );
                  }}
                >
                  <label>
                    <span className="outlook-field-label">
                      基準月
                      <InfoTip label="ここまでが確定実績です。これより後の月は見込みとして扱います。" />
                    </span>
                    <MonthPickerInput
                      aria-label="基準月"
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
                    更新
                  </button>
                </form>
                <form
                  className="outlook-form-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const month = outlookMonth.trim();
                    if (!month) {
                      onError("対象月を入力してください");
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
                      `${month} の見通しを保存しました`,
                    );
                  }}
                >
                  <label>
                    <span className="outlook-field-label">
                      対象月
                      <InfoTip label="見込みを入れる月です。一覧から1つ選んでください。" />
                    </span>
                    <MonthPickerInput
                      aria-label="対象月"
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
                    売上
                    <input
                      inputMode="numeric"
                      value={outlookRevenue}
                      onChange={(e) => setOutlookRevenue(e.target.value)}
                      disabled={mutationBusy}
                      placeholder="0"
                    />
                  </label>
                  <label>
                    経費
                    <input
                      inputMode="numeric"
                      value={outlookOpex}
                      onChange={(e) => setOutlookOpex(e.target.value)}
                      disabled={mutationBusy}
                      placeholder="0"
                    />
                  </label>
                  <label>
                    投資
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
                    保存
                  </button>
                </form>
                <form
                  className="outlook-form-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!outlookPublisherId.trim()) {
                      onError("承認者を選んでください");
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
                      "見通しを公開しました",
                    );
                  }}
                >
                  <label>
                    <span className="outlook-field-label">
                      承認者
                      <InfoTip label="編集した人以外の、組織上の人（CEO・部門長）を選びます。表示は組織図の氏名です。秘書・エージェントは選べません。" />
                    </span>
                    <select
                      value={outlookPublisherId}
                      onChange={(e) => setOutlookPublisherId(e.target.value)}
                      disabled={mutationBusy}
                    >
                      <option value="">選択してください</option>
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
                    公開
                  </button>
                </form>
                {(budget.outlook_operators ?? []).filter(
                  (op) =>
                    op.operator_id !==
                    budget.outlook_reference.last_edited_by_operator_id,
                ).length === 0 && (
                  <p className="outlook-status-note" role="status">
                    承認できる部門長が他にいません（自己承認不可）。operators
                    に承認ロールの部門長を登録してください。
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
                <span>事業計画</span>
                <InfoTip label="売上・経費の計画参照。予算の分配は「分配」タブ。" />
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
                売上
                <InfoTip
                  label={`事業計画 ${
                    budget.plan_reference.business_plan_revenue_yen == null
                      ? "—"
                      : yen(budget.plan_reference.business_plan_revenue_yen)
                  }${
                    budget.plan_reference.consistency
                      .revenue_matches_business_plan === false
                      ? " · 不一致"
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
                経費
                <InfoTip
                  label={`SGA ${
                    budget.plan_reference.profit_plan_sga_yen == null
                      ? "—"
                      : yen(budget.plan_reference.profit_plan_sga_yen)
                  }${
                    budget.plan_reference.consistency
                      .expense_matches_profit_sga === false
                      ? " · 不一致"
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
                営業利益
                <InfoTip label="損益計算書の営業利益計画（business-plan）。法人税等控除前。税引前当期純利益そのものではない。支払利息は本テナントでは経費（SGA）に含めている。" />
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
              <span>投資（設備）</span>
              <strong>
                {budget.plan_reference.business_plan_investment_yen == null
                  ? "—"
                  : yen(budget.plan_reference.business_plan_investment_yen)}
              </strong>
            </article>
          </section>

          <div className="plan-line-stack">
            <PlanUnitBreakdown
              title="売上内訳"
              units={budget.plan_reference.revenue_units ?? []}
              grandTotalYen={budget.plan_reference.revenue_plan_yen}
              emptyLabel="なし"
            />
            <PlanUnitBreakdown
              title="経費内訳"
              units={budget.plan_reference.expense_units ?? []}
              grandTotalYen={budget.plan_reference.expense_plan_yen}
              emptyLabel="なし"
              corporateLabel="全社共通"
            />
          </div>
        </section>
      )}

      {view === "payroll" && (
        <section className="plan-reference-panel payroll-tab" aria-label="人件費">
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
              })}
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
                <span>正本</span>
                <InfoTip label="画面から直接編集しない。" />
              </h2>
            </div>
            <button
              type="button"
              className="quiet-button"
              onClick={() => void reload()}
            >
              再読込
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
                  <span>{source.record_count}件</span>
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
              <h2>履歴</h2>
            </div>
            <span>{budget.events?.length ?? 0}</span>
          </div>
          {(budget.events?.length ?? 0) === 0 ? (
            <p className="empty-copy">まだ履歴はありません。</p>
          ) : (
            <BudgetHistoryList budget={budget} />
          )}
        </section>
      )}
    </>
  );
}
