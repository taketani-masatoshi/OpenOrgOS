/**
 * Tax / social / remittance obligation calendar with rough amounts.
 * Sources: tax-profile.obligation_rhythms (+ legacy filing_calendar fallback).
 */
import type {
  ObligationRhythm,
  TaxProfile,
} from "../../../schemas/finance/types.js";
import { loadPayroll, loadTaxProfile } from "../data.js";
import {
  estimateSocialEmployerRough,
  estimateWithholdingRough,
} from "./withholding.js";
import { currentDate, daysBetween, getDataDir, readYamlFile } from "../utils.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { lodgingTaxLedgerFileSchema } from "../../../schemas/hospitality-ops.js";
import {
  REFUND_CASHFLOW_CATEGORY,
  loadLiveRefundClaimsForCalendar,
  openRefundClaimAmountYen,
  refundCalendarItemsFromClaims,
} from "./consumption-tax-refund-receipt.js";

/** Max rows returned — decoupled from CEO attention canvas defaults. */
const TAX_CALENDAR_MAX_ROWS = 24;

export type AmountConfidence = "rough" | "ledger" | "budget";

export type TaxCalendarPortfolioRow = {
  id: string;
  kind: "tax" | "social" | "hr";
  tax: string;
  period_label: string;
  deadline: string;
  status: string;
  remaining_text: string;
  next_action: string;
  attention_score: number;
  amount_estimate_jpy: number | null;
  amount_confidence: AmountConfidence | null;
  amount_display: string;
  cashflow_category?: string;
};

export type TaxCalendarBoardEvent = {
  date: string;
  label: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  sublabel?: string;
};

export type TaxCalendarPortfolio = {
  as_of: string;
  rows: TaxCalendarPortfolioRow[];
  calendar_events: TaxCalendarBoardEvent[];
  stats: {
    total: number;
    due_soon: number;
    overdue: number;
    open: number;
    outflow_this_month_jpy: number;
    outflow_3m_jpy: number;
  };
};

type ExpandedItem = {
  id: string;
  kind: "tax" | "social" | "hr";
  tax: string;
  period_label: string;
  deadline?: string;
  status?: string;
  amount_estimate_jpy: number | null;
  amount_confidence: AmountConfidence | null;
  amount_note?: string;
  cashflow_category?: string;
};

type PayrollContext = {
  monthly_gross_jpy: number;
  has_employees: boolean;
  has_withholding: boolean;
  has_social_insurance: boolean;
  resident_tax_special_jpy: number;
};

type RemainingDaysCell = {
  text: string;
  tone?: "danger";
};

function formatRemainingDaysCell(
  due: string | undefined,
  today: string,
): RemainingDaysCell {
  if (!due) return { text: "—" };
  if (due === today) return { text: "本日" };
  if (due < today) {
    const n = Math.max(1, daysBetween(due, today));
    return { text: `-${n}日`, tone: "danger" };
  }
  const n = daysBetween(today, due);
  return { text: n <= 0 ? "本日" : `${n}日` };
}

function isFilingDone(status: string | undefined): boolean {
  const raw = (status ?? "").trim();
  if (!raw) return false;
  const s = raw.toLowerCase();
  if (
    s === "done" ||
    s === "filed" ||
    s === "paid" ||
    s === "closed" ||
    s === "not_required" ||
    s === "demo_confirmed" ||
    s === "received"
  ) {
    return true;
  }
  return raw === "該当なし見込み" || raw === "申告不要";
}

function nextFor(
  status: string | undefined,
  overdue: boolean,
  soon: boolean,
): string {
  if (overdue) return "申告/納付を即座に対応";
  if (soon) return "期限前に書類・納付を準備";
  if (isFilingDone(status)) return "完了済み · 証憑保管";
  return "書類・納付の準備を開始";
}

export function formatAmountEstimate(jpy: number | null | undefined): string {
  if (jpy == null || Number.isNaN(jpy)) return "—";
  if (jpy === 0) return "0";
  if (jpy >= 10_000) {
    const man = Math.round((jpy / 10_000) * 10) / 10;
    const label = Number.isInteger(man) ? String(man) : man.toFixed(1);
    return `約${label}万円`;
  }
  if (jpy >= 1000) {
    return `約${Math.round(jpy / 1000)}千円`;
  }
  return `約${Math.round(jpy)}円`;
}

function addMonths(ym: { y: number; m: number }, delta: number): {
  y: number;
  m: number;
} {
  const idx = ymToIndex(ym) + delta;
  return indexToYm(idx);
}

function ymToIndex(ym: { y: number; m: number }): number {
  return ym.y * 12 + (ym.m - 1);
}

function indexToYm(idx: number): { y: number; m: number } {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return { y, m };
}

function parseYm(date: string): { y: number; m: number } {
  return {
    y: Number(date.slice(0, 4)),
    m: Number(date.slice(5, 7)),
  };
}

function formatYm(ym: { y: number; m: number }): string {
  return `${ym.y}-${String(ym.m).padStart(2, "0")}`;
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function clampDay(y: number, m: number, day: number): string {
  const last = lastDayOfMonth(y, m);
  const d = Math.min(day, last);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function shiftDateMonths(iso: string, months: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const next = addMonths({ y, m }, months);
  return clampDay(next.y, next.m, d);
}

function loadPayrollContext(): PayrollContext {
  try {
    const p = loadPayroll();
    const ep = p.employee_payroll;
    const monthly = ep?.monthly_gross_jpy ?? 0;
    const hasEmployees = Boolean(ep && monthly > 0);
    return {
      monthly_gross_jpy: monthly,
      has_employees: hasEmployees,
      has_withholding: ep?.has_withholding ?? hasEmployees,
      has_social_insurance: ep?.has_social_insurance ?? hasEmployees,
      resident_tax_special_jpy: ep?.resident_tax_special_jpy ?? 0,
    };
  } catch {
    return {
      monthly_gross_jpy: 0,
      has_employees: false,
      has_withholding: false,
      has_social_insurance: false,
      resident_tax_special_jpy: 0,
    };
  }
}

function isConsumptionTaxable(profile: TaxProfile): boolean {
  const s = String(profile.consumption_tax?.status ?? "");
  return s.includes("課税") && !s.includes("免税");
}

function hasFixedAssets(profile: TaxProfile): boolean {
  return (profile.local_tax?.fixed_asset_tax_annual_jpy ?? 0) > 0;
}

function applyWhenOk(
  when: ObligationRhythm["apply_when"],
  profile: TaxProfile,
  payroll: PayrollContext,
): boolean {
  switch (when) {
    case "always":
      return true;
    case "has_employees":
      return payroll.has_employees;
    case "has_withholding":
      return payroll.has_withholding;
    case "has_social_insurance":
      return payroll.has_social_insurance;
    case "consumption_taxable":
      return isConsumptionTaxable(profile);
    case "has_fixed_assets":
      return hasFixedAssets(profile);
    case "has_open_consumption_refund":
      return openRefundClaimAmountYen(loadLiveRefundClaimsForCalendar()) > 0;
    default:
      return true;
  }
}

function profilePathValue(profile: TaxProfile, path: string): number | null {
  const parts = path.split(".");
  let cur: unknown = profile;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "number" && Number.isFinite(cur) ? cur : null;
}

function lodgingTaxFromLedger(periodYm: string | undefined): number | null {
  if (!periodYm || !/^\d{4}-\d{2}$/.test(periodYm)) return null;
  const path = join(getDataDir(), "operations", "lodging-tax.yaml");
  if (!existsSync(path)) return null;
  try {
    const ledger = readYamlFile(path, lodgingTaxLedgerFileSchema);
    const assessed = ledger.assessments
      .filter((row) => row.period === periodYm)
      .reduce((sum, row) => sum + row.tax_jpy, 0);
    if (assessed > 0) return assessed;
    const paid = ledger.payments
      .filter((row) => row.period === periodYm)
      .reduce((sum, row) => sum + row.amount_jpy, 0);
    return paid > 0 ? paid : null;
  } catch {
    return null;
  }
}

function resolveAmount(
  rhythm: ObligationRhythm,
  profile: TaxProfile,
  payroll: PayrollContext,
  periodYm?: string,
): {
  amount_estimate_jpy: number | null;
  amount_confidence: AmountConfidence | null;
  amount_note?: string;
} {
  const amt = rhythm.amount;
  if (!amt) {
    return { amount_estimate_jpy: null, amount_confidence: null };
  }
  const note = amt.note;
  if (amt.mode === "fixed") {
    let jpy = amt.fixed_jpy ?? null;
    if (rhythm.id === "juminzei-special" && payroll.resident_tax_special_jpy > 0) {
      jpy = payroll.resident_tax_special_jpy;
    }
    return {
      amount_estimate_jpy: jpy,
      amount_confidence: "rough",
      amount_note: note,
    };
  }
  if (amt.mode === "from_profile") {
    const jpy = amt.from_profile_path
      ? profilePathValue(profile, amt.from_profile_path)
      : null;
    return {
      amount_estimate_jpy: jpy,
      amount_confidence: jpy != null ? "budget" : null,
      amount_note: note,
    };
  }
  if (amt.mode === "from_ledger") {
    const jpy = lodgingTaxFromLedger(periodYm);
    return {
      amount_estimate_jpy: jpy,
      amount_confidence: jpy != null ? "ledger" : null,
      amount_note: note ?? (jpy == null ? "台帳に該当期間の算定なし" : undefined),
    };
  }
  if (amt.mode === "formula") {
    switch (amt.formula) {
      case "payroll_withholding_rough":
        return {
          amount_estimate_jpy: payroll.has_withholding
            ? estimateWithholdingRough(payroll.monthly_gross_jpy)
            : null,
          amount_confidence: "rough",
          amount_note: note,
        };
      case "payroll_social_employer_rough":
        return {
          amount_estimate_jpy: payroll.has_social_insurance
            ? estimateSocialEmployerRough(payroll.monthly_gross_jpy)
            : null,
          amount_confidence: "rough",
          amount_note: note,
        };
      case "fixed_asset_quarter": {
        const annual = profile.local_tax?.fixed_asset_tax_annual_jpy ?? 0;
        return {
          amount_estimate_jpy: annual > 0 ? Math.round(annual / 4) : null,
          amount_confidence: "rough",
          amount_note: note,
        };
      }
      case "consumption_refund_open": {
        const jpy = openRefundClaimAmountYen(loadLiveRefundClaimsForCalendar());
        return {
          amount_estimate_jpy: jpy > 0 ? jpy : null,
          amount_confidence: jpy > 0 ? "ledger" : null,
          amount_note: note,
        };
      }
      default:
        return { amount_estimate_jpy: null, amount_confidence: null, amount_note: note };
    }
  }
  return { amount_estimate_jpy: null, amount_confidence: null, amount_note: note };
}

function kindLabel(kind: ExpandedItem["kind"]): string {
  if (kind === "social") return "社保";
  if (kind === "hr") return "人事";
  return "税";
}

function expandMonthlyDue(
  rhythm: ObligationRhythm,
  windowStart: string,
  windowEnd: string,
  dueOnMonth: (y: number, m: number) => string,
  periodForDueMonth: (dueYm: { y: number; m: number }) => string,
): Array<{ deadline: string; period_label: string }> {
  const out: Array<{ deadline: string; period_label: string }> = [];
  let cur = parseYm(windowStart);
  const end = parseYm(windowEnd);
  while (ymToIndex(cur) <= ymToIndex(end)) {
    const deadline = dueOnMonth(cur.y, cur.m);
    if (deadline >= windowStart && deadline <= windowEnd) {
      out.push({
        deadline,
        period_label: periodForDueMonth(cur),
      });
    }
    cur = addMonths(cur, 1);
  }
  return out;
}

function expandRhythm(
  rhythm: ObligationRhythm,
  profile: TaxProfile,
  payroll: PayrollContext,
  windowStart: string,
  windowEnd: string,
): ExpandedItem[] {
  if (rhythm.enabled === false) return [];
  if (!applyWhenOk(rhythm.apply_when, profile, payroll)) return [];
  if (rhythm.amount?.formula === "consumption_refund_open") return [];

  const base = {
    kind: rhythm.kind,
    tax: rhythm.label,
    status: rhythm.status_default ?? "open",
    cashflow_category: rhythm.cashflow_category,
  };

  const items: ExpandedItem[] = [];

  if (rhythm.due_rule === "next_month_day_10") {
    const day = rhythm.day ?? 10;
    for (const occ of expandMonthlyDue(
      rhythm,
      windowStart,
      windowEnd,
      (y, m) => clampDay(y, m, day),
      (dueYm) => formatYm(addMonths(dueYm, -1)),
    )) {
      items.push({
        ...base,
        ...resolveAmount(rhythm, profile, payroll, occ.period_label),
        id: `obl-${rhythm.id}-${occ.period_label}`,
        deadline: occ.deadline,
        period_label: `${occ.period_label}分`,
      });
    }
    return items;
  }

  if (rhythm.due_rule === "end_of_month") {
    for (const occ of expandMonthlyDue(
      rhythm,
      windowStart,
      windowEnd,
      (y, m) => clampDay(y, m, lastDayOfMonth(y, m)),
      (dueYm) => formatYm(addMonths(dueYm, -1)),
    )) {
      items.push({
        ...base,
        ...resolveAmount(rhythm, profile, payroll, occ.period_label),
        id: `obl-${rhythm.id}-${occ.period_label}`,
        deadline: occ.deadline,
        period_label: `${occ.period_label}分`,
      });
    }
    return items;
  }

  if (rhythm.due_rule === "fixed_md" && rhythm.month && rhythm.day) {
    const startY = Number(windowStart.slice(0, 4)) - 1;
    const endY = Number(windowEnd.slice(0, 4)) + 1;
    for (let y = startY; y <= endY; y++) {
      const deadline = clampDay(y, rhythm.month, rhythm.day);
      if (deadline < windowStart || deadline > windowEnd) continue;
      items.push({
        ...base,
        ...resolveAmount(rhythm, profile, payroll),
        id: `obl-${rhythm.id}-${y}`,
        deadline,
        period_label: `${y}年`,
      });
    }
    return items;
  }

  if (rhythm.due_rule === "custom_mds" && rhythm.custom_mds?.length) {
    const startY = Number(windowStart.slice(0, 4)) - 1;
    const endY = Number(windowEnd.slice(0, 4)) + 1;
    for (let y = startY; y <= endY; y++) {
      for (const md of rhythm.custom_mds) {
        const deadline = clampDay(y, md.month, md.day);
        if (deadline < windowStart || deadline > windowEnd) continue;
        items.push({
          ...base,
          id: `obl-${rhythm.id}-${deadline}`,
          deadline,
          period_label: `${deadline.slice(0, 7)}`,
          ...resolveAmount(rhythm, profile, payroll, deadline.slice(0, 7)),
        });
      }
    }
    return items;
  }

  if (rhythm.due_rule === "fiscal_plus_2_months") {
    const periodTo = profile.fiscal_year?.period_to;
    if (!periodTo) return [];
    const deadline = shiftDateMonths(periodTo, 2);
    if (deadline >= windowStart && deadline <= windowEnd) {
      items.push({
        ...base,
        ...resolveAmount(rhythm, profile, payroll, periodTo.slice(0, 7)),
        id: `obl-${rhythm.id}-${deadline.slice(0, 4)}`,
        deadline,
        period_label: profile.fiscal_year?.label ?? "決算期",
      });
    }
    return items;
  }

  return items;
}

function legacyFilingItems(profile: TaxProfile): ExpandedItem[] {
  return (profile.filing_calendar ?? []).map((it) => ({
    id: it.id,
    kind: "tax" as const,
    tax: it.tax,
    period_label: "—",
    deadline: it.deadline,
    status: it.status,
    amount_estimate_jpy: null,
    amount_confidence: null,
  }));
}

export function buildTaxCalendarPortfolio(opts?: {
  today?: string;
}): TaxCalendarPortfolio {
  const today = opts?.today?.trim() || currentDate();
  const windowStart = shiftDateMonths(`${today.slice(0, 7)}-01`, -1);
  const windowEnd = shiftDateMonths(today, 12);

  let profile: TaxProfile | null = null;
  try {
    profile = loadTaxProfile() as TaxProfile;
  } catch {
    profile = null;
  }

  const payroll = loadPayrollContext();
  const expanded: ExpandedItem[] = [];

  if (profile) {
    const rhythms = profile.obligation_rhythms ?? [];
    if (rhythms.length > 0) {
      for (const r of rhythms) {
        expanded.push(
          ...expandRhythm(r, profile, payroll, windowStart, windowEnd),
        );
      }
    } else {
      expanded.push(...legacyFilingItems(profile));
    }
  }

  for (const item of refundCalendarItemsFromClaims(loadLiveRefundClaimsForCalendar())) {
    expanded.push({
      id: item.id,
      kind: "tax",
      tax: item.tax,
      period_label: item.period_label,
      deadline: item.deadline,
      status: item.status,
      amount_estimate_jpy: item.amount_estimate_jpy,
      amount_confidence: "ledger",
      cashflow_category: item.cashflow_category,
    });
  }

  const rows: TaxCalendarPortfolioRow[] = [];
  const calendar_events: TaxCalendarBoardEvent[] = [];
  let due_soon = 0;
  let overdue = 0;
  let open = 0;
  let outflow_this_month_jpy = 0;
  let outflow_3m_jpy = 0;
  const monthPrefix = today.slice(0, 7);
  const horizon3m = shiftDateMonths(today, 3);

  for (const it of expanded) {
    const done = isFilingDone(it.status);
    if (!done) open += 1;

    if (!it.deadline) {
      if (!done) {
        rows.push({
          id: it.id,
          kind: it.kind,
          tax: it.tax,
          period_label: it.period_label,
          deadline: "—",
          status: it.status ?? "open",
          remaining_text: "期限未設定",
          next_action: "期限を税プロフィールに設定",
          attention_score: 20,
          amount_estimate_jpy: it.amount_estimate_jpy,
          amount_confidence: it.amount_confidence,
          amount_display: formatAmountEstimate(it.amount_estimate_jpy),
          cashflow_category: it.cashflow_category,
        });
      }
      continue;
    }

    const rem = formatRemainingDaysCell(it.deadline, today);
    const isOverdue = !done && (rem.tone === "danger" || it.deadline < today);
    const days =
      it.deadline >= today ? daysBetween(today, it.deadline) : null;
    const soon = !done && !isOverdue && days != null && days <= 30;

    if (!done) {
      if (isOverdue) overdue += 1;
      else if (soon) due_soon += 1;
      const amt = it.amount_estimate_jpy ?? 0;
      const inflow = it.cashflow_category === REFUND_CASHFLOW_CATEGORY;
      if (!inflow) {
        if (it.deadline.startsWith(monthPrefix) || isOverdue) {
          if (it.deadline.startsWith(monthPrefix)) outflow_this_month_jpy += amt;
        }
        if (it.deadline >= today && it.deadline <= horizon3m) {
          outflow_3m_jpy += amt;
        } else if (isOverdue && amt > 0) {
          outflow_3m_jpy += amt;
        }
      }
    }

    let tone: TaxCalendarBoardEvent["tone"] = "info";
    const amtDisp = formatAmountEstimate(it.amount_estimate_jpy);
    let sublabel =
      amtDisp !== "—" ? `${amtDisp} · ${rem.text}` : rem.text;
    if (done) {
      tone = "success";
      sublabel = amtDisp !== "—" ? `${amtDisp} · 完了` : "完了";
    } else if (isOverdue) {
      tone = "danger";
    } else if (soon) {
      tone = "warning";
    }

    calendar_events.push({
      date: it.deadline,
      label: `${it.tax}`.slice(0, 28),
      tone,
      sublabel,
    });

    if (done) continue;

    let score = 25;
    if (isOverdue) score = 60;
    else if (soon) score = 45;
    rows.push({
      id: it.id,
      kind: it.kind,
      tax: it.tax.slice(0, 60),
      period_label: it.period_label,
      deadline: it.deadline,
      status: it.status ?? "open",
      remaining_text: rem.text,
      next_action: nextFor(it.status, isOverdue, soon),
      attention_score: score,
      amount_estimate_jpy: it.amount_estimate_jpy,
      amount_confidence: it.amount_confidence,
      amount_display: formatAmountEstimate(it.amount_estimate_jpy),
      cashflow_category: it.cashflow_category,
    });
  }

  rows.sort((a, b) => {
    if (a.deadline !== "—" && b.deadline !== "—") {
      const byDate = a.deadline.localeCompare(b.deadline);
      if (byDate !== 0) return byDate;
    }
    return b.attention_score - a.attention_score;
  });
  calendar_events.sort((a, b) => a.date.localeCompare(b.date));

  return {
    as_of: today,
    rows: rows.slice(0, TAX_CALENDAR_MAX_ROWS),
    calendar_events,
    stats: {
      total: expanded.length,
      due_soon,
      overdue,
      open,
      outflow_this_month_jpy,
      outflow_3m_jpy,
    },
  };
}

export function obligationKindLabel(kind: TaxCalendarPortfolioRow["kind"]): string {
  return kindLabel(kind);
}
