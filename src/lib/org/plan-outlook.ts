/**
 * Mid-year outlook (ADR 0029) — YTD actual + remaining outlook/plan.
 * OPEX / CAPEX / depreciation are tracked separately (P0).
 * Does not mutate business-plan or budget-delegations.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  midYearOutlookSchema,
  type MidYearOutlookFile,
  type OutlookLine,
  type OutlookMonth,
} from "../../../schemas/finance/outlook.js";
import {
  loadInvestmentPlan,
  loadMonthlyFinances,
  loadYojitsuFyPlan,
} from "../data.js";
import {
  addMonthlyAxis,
  axisFromMonthlyLines,
  emptyMonthlyAxis,
  type MonthlyAxisTotals,
} from "../finance/monthly-axes.js";
import { getDataDir, readYamlFile } from "../utils.js";
import { withYamlFileLock, writeYamlFileAtomic } from "../yaml-atomic.js";
import { requireExpectedRevisionToken } from "../cas-test-mode.js";
import { loadBudgetDelegation } from "./budget-delegation.js";
import {
  resolveActivePlanFiscalYear,
  resolveBusinessPlanBudgetReference,
} from "./business-plan-budget-reference.js";

export type MonthRole =
  | "actual"
  | "actual_missing"
  | "outlook"
  | "plan_fallback";

/**
 * Axis totals used for apples-to-apples gaps.
 * CAPEX is investing outflow (not P/L expense); OPEX excludes CAPEX/depreciation.
 */
export type OutlookAxisTotals = MonthlyAxisTotals;

export type OutlookMonthRollup = {
  month: string;
  role: MonthRole;
  /** How depreciation for this month was sourced (actual months only). */
  depreciation_source?: "monthly" | "yojitsu_actual" | "yojitsu_plan_fallback";
} & OutlookAxisTotals;

export type MidYearOutlookReference = {
  fiscal_year: string;
  as_of_month: string;
  status: "missing" | "draft" | "published";
  currency: string;
  method: "ytd_actual_plus_remaining";
  notes?: string;
  amount_basis_notes: string;
  file_path: string;
  file_exists: boolean;
  /** Optimistic concurrency token (last OLE event id, or "0"). */
  revision: string;
  updated_at: string | null;
  event_count: number;
  /** Approved annual plans used as comparison baselines. */
  plan: {
    revenue_yen: number;
    /** expense-plan total — OPEX / SGA baseline */
    opex_yen: number;
    /** investment-plan total — CAPEX baseline */
    capex_yen: number;
  };
  /**
   * Explains expense-plan vs yojitsu annual OPEX (remaining months follow yojitsu).
   */
  baselines: {
    expense_plan_opex_yen: number;
    yojitsu_plan_opex_yen: number;
    expense_plan_vs_yojitsu_opex_yen: number;
    note: string;
  };
  actual_ytd: OutlookAxisTotals & {
    /** True when any YTD month used yojitsu plan depreciation fallback. */
    depreciation_plan_fallback: boolean;
  };
  outlook: OutlookAxisTotals & {
    remaining_source: "outlook" | "plan_fallback" | "mixed" | "none";
    /** revenue − opex − depreciation (CAPEX excluded from OP proxy) */
    operating_profit_proxy_yen: number;
  };
  gaps: {
    /** outlook.opex − plan.opex */
    outlook_vs_plan_opex_yen: number;
    outlook_vs_plan_revenue_yen: number;
    /** outlook.opex − company envelope (OPEX only) */
    outlook_vs_envelope_opex_yen: number | null;
    /** outlook.capex − investment-plan */
    outlook_vs_plan_capex_yen: number;
    /**
     * Overspend drift only (outlook OPEX above plan by threshold).
     * Underspend does not set this (see drift_direction).
     */
    drift_alert: boolean;
    drift_alert_pct: number;
    drift_direction: "over" | "under" | "none";
    envelope_alert: boolean;
  };
  envelope_yen: number | null;
  months: OutlookMonthRollup[];
  department_outlook: Array<{
    org_unit_id: string;
    opex_yen: number;
    revenue_yen?: number;
    notes?: string;
  }>;
  department_consistency: {
    department_opex_sum_yen: number;
    company_opex_yen: number;
    delta_yen: number;
    alert: boolean;
  };
  last_edited_by_operator_id?: string | null;
  published_at?: string | null;
  published_by_operator_id?: string | null;
  /** True when status was published and a later edit reset to draft. */
  needs_republish: boolean;
};

const DEFAULT_AMOUNT_BASIS =
  "Revenue: follow yojitsu/revenue-plan (often tax-exclusive). " +
  "OPEX actuals: monthly expenses excluding category=capex|depreciation " +
  "(and notes matching 減価償却). " +
  "CAPEX: monthly category=capex and yojitsu kind=capex. " +
  "Depreciation: monthly category=depreciation / 減価償却 notes, else yojitsu actual, " +
  "else yojitsu plan fallback for actual months. " +
  "Remaining months follow outlook/yojitsu; plan.opex is expense-plan (may differ). " +
  "Envelope gaps use OPEX only (ADR 0027 / 0029). " +
  "Operating profit proxy = revenue − OPEX − depreciation (CAPEX excluded).";

function emptyAxis(): OutlookAxisTotals {
  return emptyMonthlyAxis();
}

function addAxis(
  a: OutlookAxisTotals,
  b: OutlookAxisTotals,
): OutlookAxisTotals {
  return addMonthlyAxis(a, b);
}

function outlookPath(fiscalYear: string): string {
  const id = fiscalYear.toLowerCase().replace(/^fy/, "fy");
  return join(getDataDir(), "plans", `outlook-${id}.yaml`);
}

export function outlookLogicalPath(fiscalYear: string): string {
  const id = fiscalYear.toLowerCase().replace(/^fy/, "fy");
  return `data/plans/outlook-${id}.yaml`;
}

function axisFromYojitsuLines(
  lines: Array<{ kind: string; amount: number }>,
): OutlookAxisTotals {
  const out = emptyAxis();
  for (const line of lines) {
    if (line.kind === "revenue") out.revenue_yen += line.amount;
    else if (line.kind === "capex") out.capex_yen += line.amount;
    else if (line.kind === "depreciation") out.depreciation_yen += line.amount;
    else if (line.kind === "expense" || line.kind === "non_operating") {
      out.opex_yen += line.amount;
    }
  }
  return out;
}

function fiscalMonths(fiscalYear: string): string[] {
  const yojitsu = loadYojitsuFyPlan(fiscalYear);
  if (yojitsu?.months?.length) {
    return yojitsu.months.map((m) => m.month).sort();
  }
  const year = Number(fiscalYear.match(/\d{4}/)?.[0] ?? 2026);
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const m = ((1 + i) % 12) + 1;
    const y = m === 1 ? year + 1 : year;
    months.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return months;
}

function defaultAsOf(months: string[]): string {
  const today = new Date();
  const current = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  if (months.includes(current)) return current;
  const past = months.filter((m) => m <= current);
  return past[past.length - 1] ?? months[0] ?? current;
}

function yojitsuMonthLines(
  fiscalYear: string,
  month: string,
  which: "plan" | "actual",
): Array<{ kind: string; amount: number }> {
  const yojitsu = loadYojitsuFyPlan(fiscalYear);
  const row = yojitsu?.months.find((m) => m.month === month);
  if (!row) return [];
  const block = row[which] as
    | { lines?: Array<{ kind: string; amount: number }> }
    | undefined;
  return Array.isArray(block?.lines) ? block.lines : [];
}

function monthlyActualAxis(fiscalYear: string): Map<
  string,
  OutlookAxisTotals & {
    depreciation_source?: OutlookMonthRollup["depreciation_source"];
  }
> {
  const months = new Set(fiscalMonths(fiscalYear));
  const map = new Map<
    string,
    OutlookAxisTotals & {
      depreciation_source?: OutlookMonthRollup["depreciation_source"];
    }
  >();
  for (const file of loadMonthlyFinances()) {
    // provisional/forecast must not count as YTD actual (same as budget-variance)
    if (file.basis !== "actual") continue;
    if (!months.has(file.month)) continue;
    const axis: OutlookAxisTotals & {
      depreciation_source?: OutlookMonthRollup["depreciation_source"];
    } = {
      ...axisFromMonthlyLines({
        revenue: file.revenue,
        expenses: file.expenses,
      }),
    };
    if (axis.depreciation_yen > 0) {
      axis.depreciation_source = "monthly";
    } else {
      const yActual = axisFromYojitsuLines(
        yojitsuMonthLines(fiscalYear, file.month, "actual"),
      );
      if (yActual.depreciation_yen > 0) {
        axis.depreciation_yen = yActual.depreciation_yen;
        axis.depreciation_source = "yojitsu_actual";
      } else {
        const yPlan = axisFromYojitsuLines(
          yojitsuMonthLines(fiscalYear, file.month, "plan"),
        );
        if (yPlan.depreciation_yen > 0) {
          axis.depreciation_yen = yPlan.depreciation_yen;
          axis.depreciation_source = "yojitsu_plan_fallback";
        }
      }
    }
    map.set(file.month, axis);
  }
  return map;
}

function yojitsuAnnualOpex(fiscalYear: string): number {
  let total = 0;
  for (const axis of yojitsuPlanAxis(fiscalYear).values()) {
    total += axis.opex_yen;
  }
  return total;
}

function yojitsuPlanAxis(
  fiscalYear: string,
): Map<string, OutlookAxisTotals> {
  const map = new Map<string, OutlookAxisTotals>();
  const yojitsu = loadYojitsuFyPlan(fiscalYear);
  if (!yojitsu) return map;
  for (const month of yojitsu.months) {
    const plan = month.plan as {
      lines?: Array<{ kind: string; amount: number }>;
    };
    const lines = Array.isArray(plan?.lines) ? plan.lines : [];
    map.set(month.month, axisFromYojitsuLines(lines));
  }
  return map;
}

function yojitsuPlanLinesForMonth(
  fiscalYear: string,
  month: string,
): OutlookLine[] {
  const yojitsu = loadYojitsuFyPlan(fiscalYear);
  const row = yojitsu?.months.find((m) => m.month === month);
  if (!row) return [];
  const plan = row.plan as {
    lines?: Array<{
      segment: string;
      kind: OutlookLine["kind"];
      amount: number;
      label?: string;
    }>;
  };
  if (!Array.isArray(plan?.lines)) return [];
  return plan.lines.map((line) => ({
    segment: line.segment,
    kind: line.kind,
    amount: line.amount,
    label: line.label ?? "from yojitsu plan",
  }));
}

function remainingAxisLookup(
  file: MidYearOutlookFile | null,
): Map<string, OutlookAxisTotals> {
  const map = new Map<string, OutlookAxisTotals>();
  for (const month of file?.remaining_months ?? []) {
    map.set(month.month, axisFromYojitsuLines(month.lines));
  }
  return map;
}

function investmentPlanYen(fiscalYear: string): number {
  try {
    const plan = loadInvestmentPlan();
    const year = plan.years?.find((row) => row.fiscal_year === fiscalYear);
    return year?.total ?? 0;
  } catch {
    return 0;
  }
}

function ensureOutlookEventIds(file: MidYearOutlookFile): boolean {
  let max = 0;
  for (const event of file.events) {
    const match = event.event_id?.match(/^OLE-(\d{6})$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  let dirty = false;
  for (const event of file.events) {
    if (event.event_id) continue;
    max += 1;
    event.event_id = `OLE-${String(max).padStart(6, "0")}`;
    dirty = true;
  }
  return dirty;
}

export function midYearOutlookRevision(
  file: MidYearOutlookFile | null | undefined,
): {
  revision: string;
  updated_at: string | null;
  event_count: number;
} {
  if (!file?.events?.length) {
    return { revision: "0", updated_at: null, event_count: 0 };
  }
  ensureOutlookEventIds(file);
  const last = file.events[file.events.length - 1]!;
  return {
    revision: last.event_id ?? "0",
    updated_at: last.at,
    event_count: file.events.length,
  };
}

export class OutlookRevisionConflictError extends Error {
  readonly code = "revision_conflict" as const;
  readonly currentRevision: string;
  readonly expectedRevision: string;

  constructor(currentRevision: string, expectedRevision: string) {
    super(
      `Outlook revision conflict: expected ${expectedRevision}, current ${currentRevision}`,
    );
    this.name = "OutlookRevisionConflictError";
    this.currentRevision = currentRevision;
    this.expectedRevision = expectedRevision;
  }
}

export function assertExpectedOutlookRevision(
  file: MidYearOutlookFile | null | undefined,
  expectedRevision?: string,
): void {
  requireExpectedRevisionToken(expectedRevision, "expected_outlook_revision");
  if (expectedRevision == null || expectedRevision === "") return;
  const { revision } = midYearOutlookRevision(file);
  if (revision !== expectedRevision) {
    throw new OutlookRevisionConflictError(revision, expectedRevision);
  }
}

export function loadMidYearOutlookFile(
  fiscalYear?: string,
): MidYearOutlookFile | null {
  const fy = resolveActivePlanFiscalYear(fiscalYear);
  const path = outlookPath(fy);
  if (!existsSync(path)) return null;
  const file = readYamlFile(path, midYearOutlookSchema);
  // Backfill event_id in memory only. Persist on the next explicit save so
  // read-only resolve/GET paths do not mutate tenant YAML as a side effect.
  ensureOutlookEventIds(file);
  return file;
}

let outlookLockDepth = 0;

/** Nestable exclusive section for outlook load → assert → mutate → save. */
export function withOutlookFileLock<T>(
  fiscalYear: string,
  fn: () => T,
): T {
  const path = outlookPath(fiscalYear);
  if (outlookLockDepth > 0) return fn();
  return withYamlFileLock(path, () => {
    outlookLockDepth += 1;
    try {
      return fn();
    } finally {
      outlookLockDepth -= 1;
    }
  });
}

export function saveMidYearOutlookFile(file: MidYearOutlookFile): void {
  ensureOutlookEventIds(file);
  const parsed = midYearOutlookSchema.parse(file);
  const path = outlookPath(parsed.fiscal_year);
  mkdirSync(dirname(path), { recursive: true });
  const write = (): void => {
    writeYamlFileAtomic(path, parsed);
  };
  if (outlookLockDepth > 0) {
    write();
    return;
  }
  withYamlFileLock(path, write);
}

export function resolveMidYearOutlook(opts?: {
  fiscalYear?: string;
  asOfMonth?: string;
  driftAlertPct?: number;
}): MidYearOutlookReference {
  const fiscalYear = resolveActivePlanFiscalYear(opts?.fiscalYear);
  const months = fiscalMonths(fiscalYear);
  const file = loadMidYearOutlookFile(fiscalYear);
  const asOf =
    opts?.asOfMonth?.trim() || file?.as_of_month || defaultAsOf(months);
  const planRef = resolveBusinessPlanBudgetReference(fiscalYear);
  const planRevenue =
    planRef.revenue_plan_yen ?? planRef.business_plan_revenue_yen ?? 0;
  const planOpex = planRef.expense_plan_yen ?? 0;
  const planCapex = investmentPlanYen(fiscalYear);
  const actuals = monthlyActualAxis(fiscalYear);
  const planMonths = yojitsuPlanAxis(fiscalYear);
  const outlookMonths = remainingAxisLookup(file);
  const driftPct = opts?.driftAlertPct ?? 20;

  const rollup: OutlookMonthRollup[] = [];
  let actualYtd = emptyAxis();
  let composed = emptyAxis();
  let usedOutlook = false;
  let usedFallback = false;

  let depreciationPlanFallback = false;
  for (const month of months) {
    if (month <= asOf) {
      if (actuals.has(month)) {
        const row = actuals.get(month)!;
        actualYtd = addAxis(actualYtd, row);
        composed = addAxis(composed, row);
        if (row.depreciation_source === "yojitsu_plan_fallback") {
          depreciationPlanFallback = true;
        }
        rollup.push({
          month,
          role: "actual",
          revenue_yen: row.revenue_yen,
          opex_yen: row.opex_yen,
          capex_yen: row.capex_yen,
          depreciation_yen: row.depreciation_yen,
          depreciation_source: row.depreciation_source,
        });
      } else {
        const row = planMonths.get(month) ?? emptyAxis();
        usedFallback = true;
        composed = addAxis(composed, row);
        rollup.push({ month, role: "actual_missing", ...row });
      }
      continue;
    }
    if (outlookMonths.has(month)) {
      const row = outlookMonths.get(month)!;
      usedOutlook = true;
      composed = addAxis(composed, row);
      rollup.push({ month, role: "outlook", ...row });
      continue;
    }
    const row = planMonths.get(month) ?? emptyAxis();
    usedFallback = true;
    composed = addAxis(composed, row);
    rollup.push({ month, role: "plan_fallback", ...row });
  }

  const remainingSource =
    usedOutlook && usedFallback
      ? "mixed"
      : usedOutlook
        ? "outlook"
        : usedFallback
          ? "plan_fallback"
          : "none";

  const delegation = loadBudgetDelegation();
  const envelope =
    delegation?.fiscal_year === fiscalYear
      ? delegation.company_budget_yen
      : (delegation?.company_budget_yen ?? null);

  const vsPlanOpex = composed.opex_yen - planOpex;
  const vsPlanRev = composed.revenue_yen - planRevenue;
  const vsEnvelope =
    envelope == null ? null : composed.opex_yen - envelope;
  const vsPlanCapex = composed.capex_yen - planCapex;
  const planOpexBase = planOpex > 0 ? planOpex : 1;
  const driftRatio = planOpex > 0 ? vsPlanOpex / planOpexBase : 0;
  const driftDirection: "over" | "under" | "none" =
    planOpex <= 0 || Math.abs(driftRatio) < driftPct / 100
      ? "none"
      : vsPlanOpex > 0
        ? "over"
        : "under";
  // Attention-grade alert: overspend only (underspend is informational).
  const driftAlert = driftDirection === "over";
  const envelopeAlert = vsEnvelope != null && vsEnvelope > 0;

  const deptSum = (file?.department_outlook ?? []).reduce(
    (s, row) => s + row.opex_yen,
    0,
  );
  const deptDelta = deptSum - composed.opex_yen;
  const deptAlert =
    (file?.department_outlook?.length ?? 0) > 0 &&
    composed.opex_yen > 0 &&
    Math.abs(deptDelta) / composed.opex_yen >= 0.05;

  const needsRepublish =
    file != null &&
    file.status === "draft" &&
    Boolean(file.published_at) &&
    file.events.some((e) => e.type === "publish");

  const yojitsuOpex = yojitsuAnnualOpex(fiscalYear);

  return {
    fiscal_year: fiscalYear,
    as_of_month: asOf,
    status: file?.status ?? "missing",
    currency: file?.currency ?? "JPY",
    method: "ytd_actual_plus_remaining",
    notes: file?.notes,
    amount_basis_notes: file?.amount_basis_notes ?? DEFAULT_AMOUNT_BASIS,
    file_path: outlookLogicalPath(fiscalYear),
    file_exists: file != null,
    plan: {
      revenue_yen: planRevenue,
      opex_yen: planOpex,
      capex_yen: planCapex,
    },
    baselines: {
      expense_plan_opex_yen: planOpex,
      yojitsu_plan_opex_yen: yojitsuOpex,
      expense_plan_vs_yojitsu_opex_yen: planOpex - yojitsuOpex,
      note:
        "plan.opex は expense-plan。残月見通しは outlook/yojitsu。差は計画基準の違いであり自動吸収しない。",
    },
    actual_ytd: {
      ...actualYtd,
      depreciation_plan_fallback: depreciationPlanFallback,
    },
    outlook: {
      ...composed,
      remaining_source: remainingSource,
      operating_profit_proxy_yen:
        composed.revenue_yen - composed.opex_yen - composed.depreciation_yen,
    },
    gaps: {
      outlook_vs_plan_opex_yen: vsPlanOpex,
      outlook_vs_plan_revenue_yen: vsPlanRev,
      outlook_vs_envelope_opex_yen: vsEnvelope,
      outlook_vs_plan_capex_yen: vsPlanCapex,
      drift_alert: driftAlert,
      drift_alert_pct: driftPct,
      drift_direction: driftDirection,
      envelope_alert: envelopeAlert,
    },
    envelope_yen: envelope,
    months: rollup,
    department_outlook: (file?.department_outlook ?? []).map((row) => ({
      org_unit_id: row.org_unit_id,
      opex_yen: row.opex_yen,
      revenue_yen: row.revenue_yen,
      notes: row.notes,
    })),
    department_consistency: {
      department_opex_sum_yen: deptSum,
      company_opex_yen: composed.opex_yen,
      delta_yen: deptDelta,
      alert: deptAlert,
    },
    last_edited_by_operator_id: file?.last_edited_by_operator_id,
    published_at: file?.published_at,
    published_by_operator_id: file?.published_by_operator_id,
    needs_republish: needsRepublish,
    ...(() => {
      const rev = midYearOutlookRevision(file);
      return {
        revision: rev.revision,
        updated_at: rev.updated_at,
        event_count: rev.event_count,
      };
    })(),
  };
}

function nextOutlookEventId(file: MidYearOutlookFile): string {
  ensureOutlookEventIds(file);
  let max = 0;
  for (const event of file.events) {
    const match = event.event_id?.match(/^OLE-(\d{6})$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `OLE-${String(max + 1).padStart(6, "0")}`;
}

function pushEvent(
  file: MidYearOutlookFile,
  type: MidYearOutlookFile["events"][number]["type"],
  detail?: string,
  actor?: string,
): void {
  file.events.push({
    event_id: nextOutlookEventId(file),
    at: new Date().toISOString(),
    type,
    actor_operator_id: actor,
    detail,
  });
}

function touchEditor(file: MidYearOutlookFile, actor?: string): void {
  if (actor) file.last_edited_by_operator_id = actor;
  if (file.status === "published") file.status = "draft";
}

export function initMidYearOutlook(input: {
  fiscalYear?: string;
  asOfMonth?: string;
  actorOperatorId?: string;
  notes?: string;
  expectedOutlookRevision?: string;
}): MidYearOutlookFile {
  const fiscalYear = resolveActivePlanFiscalYear(input.fiscalYear);
  return withOutlookFileLock(fiscalYear, () => {
    const months = fiscalMonths(fiscalYear);
    const asOf = input.asOfMonth?.trim() || defaultAsOf(months);
    const existing = loadMidYearOutlookFile(fiscalYear);
    assertExpectedOutlookRevision(existing, input.expectedOutlookRevision);
    if (existing) {
      throw new Error(`Outlook already exists for ${fiscalYear}`);
    }
    const remaining_months: OutlookMonth[] = months
      .filter((m) => m > asOf)
      .map((month) => ({
        month,
        lines: yojitsuPlanLinesForMonth(fiscalYear, month),
      }));
    const file: MidYearOutlookFile = midYearOutlookSchema.parse({
      fiscal_year: fiscalYear,
      as_of_month: asOf,
      status: "draft",
      currency: "JPY",
      method: "ytd_actual_plus_remaining",
      amount_basis_notes: DEFAULT_AMOUNT_BASIS,
      notes: input.notes,
      remaining_months,
      department_outlook: [],
      last_edited_by_operator_id: input.actorOperatorId ?? null,
      events: [],
    });
    pushEvent(file, "init", `as_of=${asOf}`, input.actorOperatorId);
    saveMidYearOutlookFile(file);
    return file;
  });
}

export function setOutlookRemainingMonth(input: {
  fiscalYear?: string;
  month: string;
  lines: OutlookLine[];
  actorOperatorId?: string;
  notes?: string;
  expectedOutlookRevision?: string;
}): MidYearOutlookFile {
  const fiscalYear = resolveActivePlanFiscalYear(input.fiscalYear);
  return withOutlookFileLock(fiscalYear, () => {
    let file = loadMidYearOutlookFile(fiscalYear);
    assertExpectedOutlookRevision(file, input.expectedOutlookRevision);
    if (!file) {
      file = initMidYearOutlook({
        fiscalYear,
        actorOperatorId: input.actorOperatorId,
      });
    }
    if (input.month <= file.as_of_month) {
      throw new Error(
        `Remaining month ${input.month} must be after as_of_month ${file.as_of_month}`,
      );
    }
    if (!input.lines.length) {
      throw new Error("Remaining month requires at least one line");
    }
    const next: OutlookMonth = {
      month: input.month,
      lines: input.lines,
      notes: input.notes,
    };
    const idx = file.remaining_months.findIndex((m) => m.month === input.month);
    if (idx >= 0) file.remaining_months[idx] = next;
    else file.remaining_months.push(next);
    file.remaining_months.sort((a, b) => a.month.localeCompare(b.month));
    touchEditor(file, input.actorOperatorId);
    pushEvent(
      file,
      "set_remaining",
      `${input.month} lines=${input.lines.length}`,
      input.actorOperatorId,
    );
    saveMidYearOutlookFile(file);
    return file;
  });
}

/**
 * Convenience: set month aggregate totals.
 * Replaces the month's lines with `_total` rows (detail cleared for that month)
 * so revenue / OPEX / CAPEX are not double-counted.
 */
export function setOutlookRemainingTotals(input: {
  fiscalYear?: string;
  month: string;
  revenueYen: number;
  opexYen: number;
  capexYen?: number;
  actorOperatorId?: string;
  expectedOutlookRevision?: string;
}): MidYearOutlookFile {
  const lines: OutlookLine[] = [];
  if (input.revenueYen > 0) {
    lines.push({
      segment: "_total",
      kind: "revenue",
      amount: input.revenueYen,
      label: "total override",
    });
  }
  if (input.opexYen > 0) {
    lines.push({
      segment: "_total",
      kind: "expense",
      amount: input.opexYen,
      label: "opex total override",
    });
  }
  if ((input.capexYen ?? 0) > 0) {
    lines.push({
      segment: "_total",
      kind: "capex",
      amount: input.capexYen!,
      label: "capex total override",
    });
  }
  return setOutlookRemainingMonth({
    fiscalYear: input.fiscalYear,
    month: input.month,
    lines,
    actorOperatorId: input.actorOperatorId,
    expectedOutlookRevision: input.expectedOutlookRevision,
  });
}

export function setOutlookAsOf(input: {
  fiscalYear?: string;
  asOfMonth: string;
  actorOperatorId?: string;
  expectedOutlookRevision?: string;
}): MidYearOutlookFile {
  const fiscalYear = resolveActivePlanFiscalYear(input.fiscalYear);
  return withOutlookFileLock(fiscalYear, () => {
    let file = loadMidYearOutlookFile(fiscalYear);
    assertExpectedOutlookRevision(file, input.expectedOutlookRevision);
    if (!file) {
      return initMidYearOutlook({
        fiscalYear,
        asOfMonth: input.asOfMonth,
        actorOperatorId: input.actorOperatorId,
      });
    }
    file.as_of_month = input.asOfMonth;
    file.remaining_months = file.remaining_months.filter(
      (m) => m.month > input.asOfMonth,
    );
    touchEditor(file, input.actorOperatorId);
    pushEvent(file, "set_as_of", input.asOfMonth, input.actorOperatorId);
    saveMidYearOutlookFile(file);
    return file;
  });
}

export function publishMidYearOutlook(input: {
  fiscalYear?: string;
  /** Preparer / last editor side */
  actorOperatorId: string;
  /**
   * Publisher must differ from last editor and from actor when both set
   * (self-approval prohibition, ADR 0029).
   */
  publisherOperatorId?: string;
  expectedOutlookRevision?: string;
}): MidYearOutlookFile {
  const fiscalYear = resolveActivePlanFiscalYear(input.fiscalYear);
  return withOutlookFileLock(fiscalYear, () => {
  const file = loadMidYearOutlookFile(fiscalYear);
  assertExpectedOutlookRevision(file, input.expectedOutlookRevision);
  if (!file) throw new Error(`No outlook file for ${fiscalYear}`);
  const actor = input.actorOperatorId.trim();
  if (!actor) {
    throw new Error("outlook.publish には actor（準備者）が必要です。");
  }
  const editor =
    file.last_edited_by_operator_id?.trim() ||
    [...file.events]
      .reverse()
      .find((e) => e.actor_operator_id && e.type !== "publish")
      ?.actor_operator_id?.trim();
  if (!editor) {
    throw new Error(
      "publishには編集者の記録が必要です。" +
        "先に set-remaining / sync-yojitsu 等を --actor 付きで実行してください。",
    );
  }
  const explicitPublisher = input.publisherOperatorId?.trim();
  const publisher =
    explicitPublisher || (actor !== editor ? actor : "");
  if (!publisher) {
    throw new Error(
      `自己承認は禁止されています（outlook.publish · editor=${editor}）。` +
        `別の publisher（--publisher / publisher_operator_id）を指定してください。`,
    );
  }
  if (publisher === editor) {
    throw new Error(
      `自己承認は禁止されています（outlook.publish · editor=${editor}）。` +
        `別の publisher を指定してください。`,
    );
  }
  file.status = "published";
  file.published_at = new Date().toISOString();
  file.published_by_operator_id = publisher;
  pushEvent(file, "publish", `publisher=${publisher}`, publisher);
  saveMidYearOutlookFile(file);
  return file;
  });
}

export function syncOutlookFromYojitsu(input: {
  fiscalYear?: string;
  actorOperatorId?: string;
  expectedOutlookRevision?: string;
}): MidYearOutlookFile {
  const fiscalYear = resolveActivePlanFiscalYear(input.fiscalYear);
  return withOutlookFileLock(fiscalYear, () => {
    let file = loadMidYearOutlookFile(fiscalYear);
    assertExpectedOutlookRevision(file, input.expectedOutlookRevision);
    if (!file) {
      return initMidYearOutlook({
        fiscalYear,
        actorOperatorId: input.actorOperatorId,
      });
    }
    const months = fiscalMonths(fiscalYear).filter((m) => m > file!.as_of_month);
    file.remaining_months = months.map((month) => ({
      month,
      lines: yojitsuPlanLinesForMonth(fiscalYear, month),
    }));
    touchEditor(file, input.actorOperatorId);
    pushEvent(file, "sync_yojitsu", undefined, input.actorOperatorId);
    saveMidYearOutlookFile(file);
    return file;
  });
}

export function setDepartmentOutlook(input: {
  fiscalYear?: string;
  orgUnitId: string;
  /** @deprecated Use opexYen */
  expenseYen?: number;
  opexYen?: number;
  revenueYen?: number;
  actorOperatorId?: string;
  expectedOutlookRevision?: string;
}): MidYearOutlookFile {
  const fiscalYear = resolveActivePlanFiscalYear(input.fiscalYear);
  return withOutlookFileLock(fiscalYear, () => {
    let file = loadMidYearOutlookFile(fiscalYear);
    assertExpectedOutlookRevision(file, input.expectedOutlookRevision);
    if (!file) {
      file = initMidYearOutlook({
        fiscalYear,
        actorOperatorId: input.actorOperatorId,
      });
    }
    const opexYen = input.opexYen ?? input.expenseYen;
    if (opexYen == null || !Number.isFinite(opexYen)) {
      throw new Error("department outlook requires opexYen");
    }
    const idx = file.department_outlook.findIndex(
      (row) => row.org_unit_id === input.orgUnitId,
    );
    const row = {
      org_unit_id: input.orgUnitId,
      opex_yen: opexYen,
      revenue_yen: input.revenueYen,
    };
    if (idx >= 0) file.department_outlook[idx] = row;
    else file.department_outlook.push(row);
    touchEditor(file, input.actorOperatorId);
    pushEvent(
      file,
      "set_department",
      `${input.orgUnitId}=${opexYen}`,
      input.actorOperatorId,
    );
    saveMidYearOutlookFile(file);
    return file;
  });
}

/**
 * Suggest OPEX envelope from outlook OPEX only. Read-only: does not apply,
 * does not push an outlook event, and does not advance the optimistic-lock
 * revision (a mere suggestion must not invalidate other editors' tokens).
 */
export function proposeEnvelopeFromOutlook(input: {
  fiscalYear?: string;
  actorOperatorId?: string;
}): {
  fiscal_year: string;
  suggested_company_budget_yen: number;
  current_company_budget_yen: number | null;
  delta_yen: number | null;
  basis: "outlook_opex";
  cli: string;
  note: string;
} {
  const resolved = resolveMidYearOutlook({ fiscalYear: input.fiscalYear });
  const suggested = Math.round(resolved.outlook.opex_yen);
  const current = resolved.envelope_yen;
  const delta = current == null ? null : suggested - current;
  return {
    fiscal_year: resolved.fiscal_year,
    suggested_company_budget_yen: suggested,
    current_company_budget_yen: current,
    delta_yen: delta,
    basis: "outlook_opex",
    cli:
      `orgos org budget set-company --amount ${suggested}` +
      ` --fy ${resolved.fiscal_year}` +
      "  # OPEX only · then approve (ADR 0027)",
    note:
      "Suggested amount is outlook OPEX only (CAPEX excluded). " +
      "Outlook does not raise the envelope automatically.",
  };
}
