import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  fetchOrgBudget,
  ingestExpenseClaim,
  isBudgetRevisionConflict,
  type OrgBudgetPayload,
} from "./api";
import { PayrollLanePanel } from "./PayrollLanePanel";
import { WalletOpsMeta, WalletOpsPrompts } from "./WalletOpsRail";
import { createCoalescingRunner, createSubmitGuard, withRetry } from "./webGuards";
import {
  fingerprintFromBudget,
  readBudgetSyncRuntimeOptions,
  shouldSkipBudgetSyncReload,
  subscribeBudgetMutations,
} from "./budgetLiveSync";
import { withRevisionConflictRetry } from "./budgetCasRetry";
import {
  buildWalletOpsPrompts,
  formatFetchedLabel,
  isFetchStale,
  shouldPollReloadWhileVisible,
} from "./walletOps";

/**
 * Personal budget vs actual + person-scoped payroll (read-only).
 * Ops: freshness, stable refresh, deterministic question prompts.
 */

export const WALLET_PERSON_IDS = [
  "ORG-001",
  "ORG-002",
  "ORG-003",
  "ORG-EXT-KLAB",
] as const;

export const DEMO_WALLET_PERSON_ID = "ORG-EXT-KLAB";

const WALLET_SHORT_NAME: Record<string, string> = {
  "ORG-001": "段",
  "ORG-002": "宮城",
  "ORG-003": "三塚",
  "ORG-EXT-KLAB": "竹谷",
};

function yen(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

type SplitAllocationDraft = {
  account_code: string;
  amount_yen: string;
  description?: string;
};

type ParsedReceiptPreview = {
  total_amount: number;
  lines: Array<{
    description: string;
    amount_including_tax: number;
  }>;
};

function suggestAccountFromDescription(description: string): string {
  if (/pasmo|suica|交通|電車|鉄道|タクシー|バス/i.test(description)) {
    return "5720";
  }
  if (/会議|会場/.test(description)) return "5730";
  if (/接待|交際|贈答/.test(description)) return "5710";
  return "5730";
}

function parseReceiptQrPreview(raw: string): ParsedReceiptPreview | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as {
      receipt?: {
        total_amount?: number;
        lines?: Array<{
          description?: string;
          amount_including_tax?: number;
        }>;
      };
    };
    const lines = (parsed.receipt?.lines ?? [])
      .map((line) => ({
        description: String(line.description ?? ""),
        amount_including_tax: Number(line.amount_including_tax),
      }))
      .filter(
        (line) =>
          Number.isFinite(line.amount_including_tax) &&
          line.amount_including_tax > 0,
      );
    const total = Number(parsed.receipt?.total_amount);
    if (!Number.isFinite(total) || lines.length === 0) return null;
    return { total_amount: total, lines };
  } catch {
    return null;
  }
}

function expenseClaimGateLabel(gate: string | undefined): string {
  switch (gate) {
    case "allow_immediate":
      return "枠内・即時精算可";
    case "needs_manager":
      return "上長承認が必要";
    case "needs_rep_approval":
      return "代表者承認が必要";
    case "needs_late_exception":
      return "期限超過例外承認が必要";
    case "needs_ringi":
      return "稟議承認が必要（REG-004）";
    case "needs_board":
      return "取締役会証跡が必要（REG-004 C）";
    case "blocked_dept_envelope":
      return "部門枠不足（先に階層分配へ）";
    case "blocked_company_envelope":
      return "全社枠不足";
    default:
      return gate ?? "";
  }
}

function expenseClaimStatusGateShort(gate: string | undefined): string {
  switch (gate) {
    case "allow_immediate":
      return "枠内";
    case "needs_manager":
      return "上長待ち";
    case "needs_rep_approval":
      return "代表者待ち";
    case "needs_late_exception":
      return "期限例外待ち";
    case "needs_ringi":
      return "稟議待ち";
    case "needs_board":
      return "取締役会待ち";
    case "blocked_dept_envelope":
      return "部門枠不足";
    case "blocked_company_envelope":
      return "全社枠不足";
    default:
      return gate ?? "";
  }
}

function shortName(personId: string, displayName: string): string {
  return WALLET_SHORT_NAME[personId] ?? displayName.trim().slice(0, 3);
}

type WalletRow = {
  account_name: string;
  allocation_yen: number;
  actual_yen: number;
  remaining_yen: number;
};

type WalletView = {
  person_id: string;
  display_name: string;
  org_unit_label: string;
  allocation_yen: number;
  actual_yen: number;
  remaining_yen: number;
  rows: WalletRow[];
};

type WalletOption = {
  person_id: string;
  display_name: string;
  allocation_yen: number;
  actual_yen: number;
  remaining_yen: number;
};

function listWalletOptions(budget: OrgBudgetPayload): WalletOption[] {
  const byId = new Map<string, WalletOption>();
  for (const department of budget.departments ?? []) {
    for (const member of department.members) {
      if (
        !WALLET_PERSON_IDS.includes(
          member.person_id as (typeof WALLET_PERSON_IDS)[number],
        )
      ) {
        continue;
      }
      byId.set(member.person_id, {
        person_id: member.person_id,
        display_name: member.display_name,
        allocation_yen: member.allocation_yen,
        actual_yen: member.actual_yen,
        remaining_yen: member.allocation_yen - member.actual_yen,
      });
    }
  }
  return WALLET_PERSON_IDS.map((id) => byId.get(id)).filter(
    (row): row is WalletOption => Boolean(row),
  );
}

function buildWallet(
  budget: OrgBudgetPayload,
  personId: string,
): WalletView | null {
  for (const department of budget.departments ?? []) {
    const member = department.members.find((row) => row.person_id === personId);
    if (!member) continue;
    return {
      person_id: member.person_id,
      display_name: member.display_name,
      org_unit_label: department.org_unit_label,
      allocation_yen: member.allocation_yen,
      actual_yen: member.actual_yen,
      remaining_yen: member.allocation_yen - member.actual_yen,
      rows: member.categories.map((category) => ({
        account_name: category.account_name,
        allocation_yen: category.allocation_yen,
        actual_yen: category.actual_yen,
        remaining_yen: category.allocation_yen - category.actual_yen,
      })),
    };
  }
  return null;
}

function readPersonFromUrl(): string | null {
  const value = new URLSearchParams(window.location.search).get("person");
  if (!value) return null;
  return WALLET_PERSON_IDS.includes(value as (typeof WALLET_PERSON_IDS)[number])
    ? value
    : null;
}

function readLaneFromUrl(): "envelope" | "payroll" {
  return new URLSearchParams(window.location.search).get("lane") === "payroll"
    ? "payroll"
    : "envelope";
}

function writeWalletUrl(personId: string, lane: "envelope" | "payroll") {
  const url = new URL(window.location.href);
  url.searchParams.set("person", personId);
  if (lane === "payroll") url.searchParams.set("lane", "payroll");
  else url.searchParams.delete("lane");
  url.searchParams.delete("admin");
  window.history.replaceState({}, "", url);
}

export function PersonalWallet() {
  const [budget, setBudget] = useState<OrgBudgetPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [personId, setPersonId] = useState(
    () => readPersonFromUrl() ?? DEMO_WALLET_PERSON_ID,
  );
  const [lane, setLane] = useState<"envelope" | "payroll">(readLaneFromUrl);
  const [qrPayload, setQrPayload] = useState("");
  const [accountCode, setAccountCode] = useState("5730");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitLines, setSplitLines] = useState<SplitAllocationDraft[]>([
    { account_code: "5720", amount_yen: "" },
    { account_code: "5730", amount_yen: "" },
  ]);
  const [splitAutoFilled, setSplitAutoFilled] = useState(false);
  const [receiptPreview, setReceiptPreview] =
    useState<ParsedReceiptPreview | null>(null);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const budgetRef = useRef(budget);
  budgetRef.current = budget;
  const fetchedAtRef = useRef(fetchedAt);
  fetchedAtRef.current = fetchedAt;
  const reloadRunner = useMemo(
    () =>
      createCoalescingRunner<{ soft?: boolean; notice?: string }>(
        (previous, next) => ({
          soft: next.soft ?? previous.soft,
          notice: next.notice ?? previous.notice,
        }),
      ),
    [],
  );
  const ingestGuard = useMemo(() => createSubmitGuard(), []);

  const reloadStable = useCallback(
    async (opts?: { soft?: boolean; notice?: string }) => {
      await reloadRunner.run(opts ?? {}, async (args) => {
        const soft = Boolean(args.soft && budgetRef.current);
        const seq = ++requestSeq.current;
        if (soft) setRefreshing(true);
        else setLoading(true);
        if (!soft) setError(null);
        try {
          const next = await withRetry(() => fetchOrgBudget());
          if (seq !== requestSeq.current) return;
          setBudget(next);
          setFetchedAt(Date.now());
          setError(null);
          if (args.notice) {
            setSyncNotice(args.notice);
          }
        } catch (caught) {
          if (seq !== requestSeq.current) return;
          setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
          if (seq === requestSeq.current) {
            setLoading(false);
            setRefreshing(false);
          }
        }
      });
    },
    [reloadRunner],
  );

  useEffect(() => {
    void reloadStable();
  }, [reloadStable]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let pendingNotice = false;
    const syncOpts = readBudgetSyncRuntimeOptions();
    function maybeRefresh(opts?: { force?: boolean; notice?: string }) {
      // Do not gate on loading/refreshing — coalescing runner queues follow-ups.
      if (!opts?.force) {
        const stale = isFetchStale(fetchedAtRef.current, Date.now());
        if (stale === "fresh") return;
      }
      void reloadStable({ soft: true, notice: opts?.notice });
    }
    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      if (pendingNotice) {
        pendingNotice = false;
        setSyncNotice("他画面で予算が更新されました（再取得済み）");
      }
      maybeRefresh();
    }
    function onFocus() {
      if (pendingNotice) {
        pendingNotice = false;
        setSyncNotice("他画面で予算が更新されました（再取得済み）");
      }
      maybeRefresh();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const unsubscribe = subscribeBudgetMutations((message) => {
      const current = budgetRef.current
        ? fingerprintFromBudget(budgetRef.current)
        : {};
      // Skip only when content_tag matches (revision alone is not enough —
      // claim status can change without a new BDE event).
      if (shouldSkipBudgetSyncReload(message, current)) {
        return;
      }
      const notice =
        message.source === "admin"
          ? "管理画面の変更を反映しました"
          : "予算データが更新されました";
      // Reload even when the tab is hidden so state is fresh on return.
      if (document.visibilityState === "visible") {
        maybeRefresh({ force: true, notice });
      } else {
        pendingNotice = true;
        maybeRefresh({ force: true });
      }
    });
    // Poll-only / short interval for E2E via __ORGOS_BUDGET_SYNC__.pollMs
    const pollMinAgeMs = Math.min(30_000, Math.max(250, syncOpts.pollMs / 2));
    const pollId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (
        !shouldPollReloadWhileVisible(
          fetchedAtRef.current,
          Date.now(),
          pollMinAgeMs,
        )
      ) {
        return;
      }
      maybeRefresh({ force: true });
    }, syncOpts.pollMs);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
      window.clearInterval(pollId);
    };
    // Refs keep poll/stale checks fresh — avoid resubscribing BroadcastChannel
    // on every fetch (that gap dropped cross-tab mutations).
  }, [reloadStable]);

  useEffect(() => {
    if (!syncNotice) return;
    const id = window.setTimeout(() => setSyncNotice(null), 6_000);
    return () => window.clearTimeout(id);
  }, [syncNotice]);

  useEffect(() => {
    function onPopState() {
      startTransition(() => {
        setPersonId(readPersonFromUrl() ?? DEMO_WALLET_PERSON_ID);
        setLane(readLaneFromUrl());
      });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const options = useMemo(
    () => (budget ? listWalletOptions(budget) : []),
    [budget],
  );

  useEffect(() => {
    if (options.length === 0) return;
    if (!options.some((row) => row.person_id === personId)) {
      const fallback = options[0]?.person_id ?? DEMO_WALLET_PERSON_ID;
      setPersonId(fallback);
      writeWalletUrl(fallback, lane);
    }
  }, [options, personId, lane]);

  const wallet = useMemo(
    () => (budget ? buildWallet(budget, personId) : null),
    [budget, personId],
  );

  const personPayroll = budget?.payroll_by_person?.[personId];
  const stale = isFetchStale(fetchedAt, clock);
  const fetchedLabel = formatFetchedLabel(fetchedAt, clock);

  const prompts = useMemo(() => {
    if (!budget) return [];
    const display =
      wallet?.display_name ??
      options.find((row) => row.person_id === personId)?.display_name ??
      personId;
    return buildWalletOpsPrompts({
      lane,
      person_id: personId,
      display_name: display,
      envelope: wallet
        ? {
            allocation_yen: wallet.allocation_yen,
            actual_yen: wallet.actual_yen,
            remaining_yen: wallet.remaining_yen,
            over_categories: wallet.rows
              .filter((row) => row.remaining_yen < 0)
              .map((row) => row.account_name),
          }
        : null,
      payroll: personPayroll
        ? {
            kind: personPayroll.kind,
            expected_monthly_yen: personPayroll.expected_monthly_yen,
            actual_months: personPayroll.actual_months,
            empty_actual_months: personPayroll.empty_actual_months,
            actual_booked_yen: personPayroll.actual_booked_yen,
            actual_expected_yen: personPayroll.actual_expected_yen,
            actual_variance_yen: personPayroll.actual_variance_yen,
            ok: personPayroll.ok,
            months: personPayroll.months,
          }
        : null,
      company_payroll_ok: budget.payroll_reference?.ok,
      actual_as_of: budget.actuals?.actual_as_of ?? null,
    });
  }, [budget, lane, personId, personPayroll, wallet, options]);

  function selectPerson(nextId: string) {
    startTransition(() => {
      setPersonId(nextId);
      writeWalletUrl(nextId, lane);
    });
  }

  function selectLane(next: "envelope" | "payroll") {
    startTransition(() => {
      setLane(next);
      writeWalletUrl(personId, next);
    });
  }

  const personClaims = useMemo(
    () =>
      (budget?.expense_claims ?? []).filter(
        (claim) => claim.person_id === personId,
      ),
    [budget, personId],
  );

  const orgUnitId = useMemo(() => {
    for (const department of budget?.departments ?? []) {
      if (department.members.some((m) => m.person_id === personId)) {
        return department.org_unit_id;
      }
    }
    return "";
  }, [budget, personId]);

  useEffect(() => {
    const preview = parseReceiptQrPreview(qrPayload);
    setReceiptPreview(preview);
    if (!preview || preview.lines.length < 2) {
      setSplitAutoFilled(false);
      return;
    }
    setSplitEnabled(true);
    setSplitLines(
      preview.lines.map((line) => ({
        account_code: suggestAccountFromDescription(line.description),
        amount_yen: String(line.amount_including_tax),
        description: line.description,
      })),
    );
    setSplitAutoFilled(true);
  }, [qrPayload]);

  async function submitReceiptIngest() {
    if (!orgUnitId || !qrPayload.trim()) {
      setIngestMessage("部門と領収書ペイロードが必要です");
      return;
    }
    const allocations = splitEnabled
      ? splitLines.map((line, index) => ({
          account_code: line.account_code,
          amount_yen: Number(line.amount_yen),
          org_unit_id: orgUnitId,
          person_id: personId,
          line_index: index,
          description: line.description,
        }))
      : undefined;
    if (allocations) {
      if (
        allocations.length < 2 ||
        allocations.some(
          (row) =>
            !row.account_code ||
            !Number.isFinite(row.amount_yen) ||
            row.amount_yen <= 0,
        )
      ) {
        setIngestMessage("分割配賦は2行以上、各行は正の金額が必要です");
        return;
      }
      const total = allocations.reduce((sum, row) => sum + row.amount_yen, 0);
      const expected =
        receiptPreview?.total_amount ??
        parseReceiptQrPreview(qrPayload)?.total_amount;
      if (expected != null && total !== expected) {
        setIngestMessage(
          `分割配賦の合計 ${total} が領収書総額 ${expected} と一致しません`,
        );
        return;
      }
    }
    await ingestGuard.run(async () => {
      setIngestBusy(true);
      setIngestMessage(null);
      try {
        const next = await withRevisionConflictRetry(
          () =>
            ingestExpenseClaim({
              expected_claims_revision:
                budgetRef.current?.claims_revision ?? "0",
              qr: qrPayload.trim(),
              person_id: personId,
              org_unit_id: orgUnitId,
              account_code: allocations?.[0]?.account_code ?? accountCode,
              allocations,
            }),
          async () => {
            // Update ref immediately so the retry reads the fresh token
            // before React re-renders.
            const refreshed = await withRetry(() => fetchOrgBudget());
            budgetRef.current = refreshed;
            setBudget(refreshed);
            setFetchedAt(Date.now());
          },
        );
        setBudget(next);
        setFetchedAt(Date.now());
        const gate = (next as { gate?: { gate?: string; message?: string } })
          .gate;
        const claim = (next as {
          claim?: {
            claim_id?: string;
            status?: string;
            notes?: string;
            issuer?: { wire_ready?: boolean };
          };
        }).claim;
        const gateLabel = expenseClaimGateLabel(gate?.gate);
        const wireNote = claim?.notes?.match(
          /wire:steward\.receipt\.claim\.requested:(sent|failed|skipped)[^·]*/,
        )?.[0];
        setIngestMessage(
          [
            "取込完了",
            claim?.claim_id,
            gateLabel,
            claim?.status,
            gate?.message,
            wireNote,
          ]
            .filter(Boolean)
            .join(" · "),
        );
        setQrPayload("");
        if (splitEnabled) {
          setSplitLines((rows) =>
            rows.map((row) => ({ ...row, amount_yen: "" })),
          );
        }
      } catch (caught) {
        if (isBudgetRevisionConflict(caught)) {
          setIngestMessage(
            "他の操作者が先に精算を更新しました。最新を再取得しました。内容を確認して再度取り込んでください。",
          );
          void reloadStable({ soft: true });
          return;
        }
        const message = caught instanceof Error ? caught.message : String(caught);
        const blockedDept = message.includes("blocked_dept_envelope");
        setIngestMessage(
          blockedDept
            ? `${message} — 管理画面の「階層分配へ」から部門枠を先に増やしてください`
            : message,
        );
      } finally {
        setIngestBusy(false);
      }
    });
  }

  if (loading && !budget) {
    return (
      <div className="wallet-shell">
        <div className="wallet-page wallet-loading" role="status">
          個人予実を読み込み中…
        </div>
      </div>
    );
  }

  if (error && !budget) {
    return (
      <div className="wallet-shell">
        <div className="wallet-page">
          <p className="error-banner">{error}</p>
          <button
            type="button"
            className="primary-button"
            onClick={() => void reloadStable()}
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-shell">
      <div className="wallet-page">
        <header className="wallet-topbar">
          <div className="wallet-brand">
            <span className="wallet-brand-mark" aria-hidden="true">
              ¥
            </span>
            <div>
              <h1 className="wallet-title ops-page-title">個人予実</h1>
            </div>
          </div>
        </header>

        <WalletOpsMeta
          fiscalYear={budget?.fiscal_year}
          actualAsOf={budget?.actuals?.actual_as_of}
          revision={budget?.revision}
          fetchedLabel={fetchedLabel}
          stale={stale}
          refreshing={refreshing}
          onRefresh={() => void reloadStable({ soft: true })}
        />

        {syncNotice && (
          <div
            className="wallet-sync-banner"
            role="status"
            aria-live="polite"
            data-testid="wallet-sync-banner"
          >
            <span>{syncNotice}</span>
            <button
              type="button"
              className="wallet-ghost-btn"
              onClick={() => setSyncNotice(null)}
            >
              閉じる
            </button>
          </div>
        )}

        <div className="wallet-lane-switch" role="tablist" aria-label="表示レーン">
          <button
            type="button"
            role="tab"
            aria-selected={lane === "envelope"}
            className={
              lane === "envelope" ? "wallet-lane-card is-active" : "wallet-lane-card"
            }
            onClick={() => selectLane("envelope")}
          >
            <span className="wallet-lane-card__title">経費枠</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lane === "payroll"}
            className={
              lane === "payroll" ? "wallet-lane-card is-active" : "wallet-lane-card"
            }
            onClick={() => selectLane("payroll")}
          >
            <span className="wallet-lane-card__title">人件費</span>
            {personPayroll && personPayroll.kind !== "none" ? (
              <span
                className={`wallet-lane-card__status ${
                  personPayroll.expected_monthly_yen === 0 &&
                  personPayroll.actual_booked_yen === 0
                    ? "is-ok"
                    : personPayroll.actual_months === 0
                      ? "is-muted"
                      : personPayroll.ok
                        ? "is-ok"
                        : "is-warn"
                }`}
              >
                {personPayroll.expected_monthly_yen === 0 &&
                personPayroll.actual_booked_yen === 0
                  ? "一致"
                  : personPayroll.actual_months === 0
                    ? "未計上"
                    : personPayroll.ok
                      ? "一致"
                      : "要確認"}
              </span>
            ) : null}
          </button>
        </div>

        <nav className="wallet-tabs" aria-label="個人の切替">
          {options.map((option) => {
            const active = option.person_id === personId;
            const over = option.remaining_yen < 0;
            const slice = budget?.payroll_by_person?.[option.person_id];
            const payrollChip =
              slice && slice.kind !== "none"
                ? yen(slice.expected_monthly_yen)
                : "—";
            return (
              <button
                key={option.person_id}
                type="button"
                className={active ? "wallet-tab is-active" : "wallet-tab"}
                onClick={() => selectPerson(option.person_id)}
              >
                <span className="wallet-tab-name">
                  {shortName(option.person_id, option.display_name)}
                </span>
                <span
                  className={
                    lane === "envelope" && over
                      ? "wallet-tab-remain is-over"
                      : "wallet-tab-remain"
                  }
                >
                  {lane === "payroll" ? payrollChip : yen(option.remaining_yen)}
                </span>
              </button>
            );
          })}
        </nav>

        {error && (
          <div className="error-banner error-banner-with-retry">
            <span>更新失敗 — 表示は前回のままです。{error}</span>
            <button
              type="button"
              className="quiet-button"
              onClick={() => void reloadStable({ soft: true })}
            >
              再試行
            </button>
          </div>
        )}

        <WalletOpsPrompts
          prompts={prompts}
          scope={`${personId}:${lane}`}
        />

        {lane === "payroll" ? (
          <section
            className={refreshing ? "wallet-panel is-refreshing" : "wallet-panel"}
            aria-label="人件費"
            aria-busy={refreshing}
          >
            <PayrollLanePanel
              mode="person"
              payroll={personPayroll}
              personLabel={
                wallet?.display_name ??
                options.find((row) => row.person_id === personId)?.display_name
              }
            />
          </section>
        ) : !wallet ? (
          <p className="empty-copy">この人への個人経費枠はまだありません。</p>
        ) : (
          <div
            key={wallet.person_id}
            className={refreshing ? "wallet-panel is-refreshing" : "wallet-panel"}
            aria-busy={refreshing}
          >
            <section className="wallet-hero" aria-label="経費枠要約">
              <div className="wallet-hero-identity">
                <h2>{wallet.display_name}</h2>
                <p>
                  {wallet.org_unit_label}
                  {budget?.fiscal_year ? ` · ${budget.fiscal_year}` : ""}
                </p>
              </div>
              <div className="wallet-abc" aria-label="経費枠と実績">
                <div className="wallet-abc-col is-budget">
                  <span>経費枠</span>
                  <strong className="wallet-amount">
                    {yen(wallet.allocation_yen)}
                  </strong>
                </div>
                <div className="wallet-abc-col is-actual">
                  <span>経費実績</span>
                  <strong className="wallet-amount">
                    {yen(wallet.actual_yen)}
                  </strong>
                </div>
                <div className="wallet-abc-col is-remain">
                  <span>残額</span>
                  <strong
                    className={
                      wallet.remaining_yen < 0
                        ? "wallet-amount is-over"
                        : "wallet-amount"
                    }
                  >
                    {yen(wallet.remaining_yen)}
                  </strong>
                </div>
              </div>
              {wallet.remaining_yen < 0 ? (
                <p className="empty-copy">経費枠超過</p>
              ) : null}
            </section>

            <section className="wallet-receipt-ingest" aria-label="領収書取込">
              <div className="wallet-section-head">
                <h2>領収書を取り込む</h2>
              </div>
              <p className="empty-copy">
                発行組織の署名付き QR リンクまたは JSON を貼り付け、費目を選んで精算します。
              </p>
              <label className="wallet-field wallet-split-toggle">
                <span>
                  <input
                    type="checkbox"
                    checked={splitEnabled}
                    onChange={(event) => setSplitEnabled(event.target.checked)}
                  />{" "}
                  複数科目に分割配賦する
                </span>
              </label>
              {splitEnabled ? (
                <fieldset className="wallet-split-allocations" aria-label="分割配賦">
                  <legend>
                    分割配賦（合計＝領収書総額
                    {receiptPreview
                      ? ` ${yen(receiptPreview.total_amount)}`
                      : ""}
                    ）
                    {splitAutoFilled ? " · QR明細から自動入力" : ""}
                  </legend>
                  {splitLines.map((line, index) => (
                    <div key={`split-${index}`} className="wallet-split-row">
                      <label className="wallet-field">
                        <span>費目 {index + 1}</span>
                        <select
                          value={line.account_code}
                          onChange={(event) =>
                            setSplitLines((rows) =>
                              rows.map((row, rowIndex) =>
                                rowIndex === index
                                  ? {
                                      ...row,
                                      account_code: event.target.value,
                                    }
                                  : row,
                              ),
                            )
                          }
                        >
                          {(budget?.person_account_catalog ?? []).map((row) => (
                            <option
                              key={row.account_code}
                              value={row.account_code}
                            >
                              {row.account_code} {row.account_name}
                            </option>
                          ))}
                          {(budget?.person_account_catalog?.length ?? 0) ===
                          0 ? (
                            <>
                              <option value="5730">5730 会議費</option>
                              <option value="5710">5710 交際費</option>
                              <option value="5720">5720 旅費交通費</option>
                            </>
                          ) : null}
                        </select>
                      </label>
                      <label className="wallet-field">
                        <span>金額（円）</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={line.amount_yen}
                          onChange={(event) =>
                            setSplitLines((rows) =>
                              rows.map((row, rowIndex) =>
                                rowIndex === index
                                  ? { ...row, amount_yen: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      </label>
                      {splitLines.length > 2 ? (
                        <button
                          type="button"
                          className="quiet-button"
                          onClick={() =>
                            setSplitLines((rows) =>
                              rows.filter((_, rowIndex) => rowIndex !== index),
                            )
                          }
                        >
                          行を削除
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() =>
                      setSplitLines((rows) => [
                        ...rows,
                        { account_code: accountCode, amount_yen: "" },
                      ])
                    }
                  >
                    行を追加
                  </button>
                </fieldset>
              ) : (
                <label className="wallet-field">
                  <span>費目</span>
                  <select
                    value={accountCode}
                    onChange={(event) => setAccountCode(event.target.value)}
                  >
                    {(budget?.person_account_catalog ?? []).map((row) => (
                      <option key={row.account_code} value={row.account_code}>
                        {row.account_code} {row.account_name}
                      </option>
                    ))}
                    {(budget?.person_account_catalog?.length ?? 0) === 0 ? (
                      <>
                        <option value="5730">5730 会議費</option>
                        <option value="5710">5710 交際費</option>
                        <option value="5720">5720 旅費交通費</option>
                      </>
                    ) : null}
                  </select>
                </label>
              )}
              <label className="wallet-field">
                <span>QR / 署名付きペイロード</span>
                <textarea
                  rows={4}
                  value={qrPayload}
                  onChange={(event) => setQrPayload(event.target.value)}
                  placeholder="https://receipt.oorgos.org/r#v2z.… または JSON"
                />
              </label>
              <button
                type="button"
                className="primary-button"
                disabled={ingestBusy || !qrPayload.trim()}
                onClick={() => void submitReceiptIngest()}
              >
                {ingestBusy ? "取込中…" : "取り込む"}
              </button>
              {ingestMessage ? (
                <p className="empty-copy" role="status">
                  {ingestMessage}
                </p>
              ) : null}
            </section>

            {personClaims.length > 0 ? (
              <section className="wallet-claims" aria-label="精算案件">
                <div className="wallet-section-head">
                  <h2>精算案件</h2>
                </div>
                <ul className="wallet-claim-list">
                  {personClaims.map((claim) => {
                    const gateLabel = expenseClaimStatusGateShort(claim.gate);
                    const statusLabel =
                      claim.status === "pending_reimbursement"
                        ? "弁済待ち"
                        : claim.status === "reimbursed"
                          ? "弁済済"
                          : claim.status === "posted"
                            ? "計上済"
                            : claim.status === "pending_approval"
                              ? "承認待ち"
                              : claim.status === "approved"
                                ? "承認済"
                                : claim.status === "rejected"
                                  ? "却下"
                                  : claim.status;
                    const wireStatus = claim.notes?.includes(":sent:")
                      ? "Wire送信済"
                      : claim.notes?.includes(":failed:")
                        ? "Wire失敗（精算継続）"
                        : claim.notes?.includes(":skipped")
                          ? "Wireスキップ"
                          : claim.wire_ready
                            ? "Wire対象"
                            : "Wireなし";
                    const invoiceStatus =
                      claim.invoice_verification?.status === "format_only"
                        ? "T番号:format_only"
                        : claim.invoice_verification?.status === "verified"
                          ? "T番号:verified"
                          : null;
                    const lateStatus =
                      claim.deadline_status === "late"
                        ? `${claim.days_after_transaction ?? "?"}日後提出`
                        : null;
                    const allocationLabel =
                      claim.allocations && claim.allocations.length > 1
                        ? claim.allocations
                            .map(
                              (row) =>
                                `${row.account_code}:${yen(row.amount_yen)}`,
                            )
                            .join(" / ")
                        : null;
                    return (
                      <li key={claim.claim_id}>
                        <strong>{claim.claim_id}</strong> {statusLabel}
                        {gateLabel ? ` · ${gateLabel}` : ""} ·{" "}
                        {allocationLabel ??
                          `${claim.account_code} · ${yen(claim.amount_yen)}`}{" "}
                        · {claim.receipt_id}
                        {lateStatus ? ` · ${lateStatus}` : ""}
                        {invoiceStatus ? ` · ${invoiceStatus}` : ""} ·{" "}
                        {wireStatus}
                        <br />
                        <span className="muted">
                          進捗: 取込
                          {claim.status === "pending_approval"
                            ? " → 承認待ち"
                            : claim.status === "rejected"
                              ? " → 却下"
                              : " → 承認"}
                          {claim.status === "pending_reimbursement" ||
                          claim.status === "posted"
                            ? " → 計上 → 弁済待ち"
                            : claim.status === "reimbursed"
                              ? " → 計上 → 弁済済"
                              : ""}
                          {claim.reject_reason
                            ? ` · 理由: ${claim.reject_reason}`
                            : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <section className="wallet-categories" aria-label="費目別経費枠">
              <div className="wallet-section-head">
                <h2>費目</h2>
              </div>
              <div
                className="wallet-ledger"
                role="table"
                aria-label="費目の経費枠・実績・残額"
              >
                <div className="wallet-ledger-head" role="row">
                  <span role="columnheader">費目</span>
                  <span role="columnheader">経費枠</span>
                  <span role="columnheader">実績</span>
                  <span role="columnheader">残額</span>
                </div>
                {wallet.rows.map((row) => {
                  const usedPct =
                    row.allocation_yen > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (row.actual_yen / row.allocation_yen) * 100,
                          ),
                        )
                      : 0;
                  return (
                    <div
                      key={row.account_name}
                      className="wallet-ledger-row"
                      role="row"
                    >
                      <span className="wallet-ledger-name" role="cell">
                        {row.account_name}
                      </span>
                      <span className="wallet-ledger-budget" role="cell">
                        {yen(row.allocation_yen)}
                      </span>
                      <span className="wallet-ledger-actual" role="cell">
                        {yen(row.actual_yen)}
                      </span>
                      <span
                        className={
                          row.remaining_yen < 0
                            ? "wallet-ledger-remain is-over"
                            : "wallet-ledger-remain"
                        }
                        role="cell"
                      >
                        {yen(row.remaining_yen)}
                      </span>
                      <div
                        className="wallet-bar"
                        aria-hidden="true"
                        style={{ "--used": `${usedPct}%` } as CSSProperties}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
