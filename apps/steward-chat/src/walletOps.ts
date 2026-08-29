/**
 * Deterministic ops helpers for personal budget / payroll UX.
 * No LLM — questions are generated from payload state only.
 */

import type { UiLocale } from "@ops-shared/locale";
import { walletOpsCopy } from "./wallet-ops-copy";

export type OpsPromptSeverity = "info" | "warn" | "critical";

export type OpsPrompt = {
  id: string;
  severity: OpsPromptSeverity;
  title: string;
  question: string;
  hints: string[];
};

export type WalletOpsInput = {
  lane: "envelope" | "payroll";
  person_id: string;
  display_name: string;
  envelope?: {
    allocation_yen: number;
    actual_yen: number;
    remaining_yen: number;
    over_categories: string[];
  } | null;
  payroll?: {
    kind: "officer" | "employee" | "none";
    expected_monthly_yen: number;
    actual_months: number;
    empty_actual_months: number;
    actual_booked_yen: number;
    actual_expected_yen: number;
    actual_variance_yen: number;
    ok: boolean;
    /** actual months in order; used to detect mid-series holes vs leading empty. */
    months?: Array<{ month: string; booked_yen: number; basis?: string }>;
  } | null;
  company_payroll_ok?: boolean;
  actual_as_of?: string | null;
  /** ISO month YYYY-MM for “today” in tenant calendar (testable). */
  now_month?: string;
};

export const STALE_SOFT_MS = 60_000;
export const STALE_HARD_MS = 5 * 60_000;

export function isFetchStale(
  fetchedAtMs: number | null,
  nowMs = Date.now(),
): "fresh" | "soft" | "hard" {
  if (fetchedAtMs == null) return "hard";
  const age = nowMs - fetchedAtMs;
  if (age >= STALE_HARD_MS) return "hard";
  if (age >= STALE_SOFT_MS) return "soft";
  return "fresh";
}

/**
 * Whether a visible tab should soft-reload on the poll tick.
 * Always true when soft/hard stale; also true on interval while visible
 * so long-lived tabs do not keep stale "fresh" data forever.
 */
export function shouldPollReloadWhileVisible(
  fetchedAtMs: number | null,
  nowMs = Date.now(),
  minAgeMs = 30_000,
): boolean {
  if (fetchedAtMs == null) return true;
  return nowMs - fetchedAtMs >= minAgeMs;
}

export function formatFetchedLabel(
  fetchedAtMs: number | null,
  nowMs = Date.now(),
  locale: UiLocale = "ja",
): string {
  const copy = walletOpsCopy(locale);
  if (fetchedAtMs == null) return copy.notFetched;
  const ageSec = Math.max(0, Math.round((nowMs - fetchedAtMs) / 1000));
  if (ageSec < 15) return copy.justNow;
  if (ageSec < 60) return copy.secondsAgo(ageSec);
  const ageMin = Math.round(ageSec / 60);
  if (ageMin < 60) return copy.minutesAgo(ageMin);
  return copy.hoursAgo(Math.round(ageMin / 60));
}

function currentMonth(nowMonth?: string): string {
  if (nowMonth) return nowMonth;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** True when actual_as_of is more than one calendar month behind now_month. */
export function isActualAsOfLagging(
  actualAsOf: string | null | undefined,
  nowMonth?: string,
): boolean {
  if (!actualAsOf || !/^\d{4}-\d{2}$/.test(actualAsOf)) return false;
  const now = currentMonth(nowMonth);
  const [ay, am] = actualAsOf.split("-").map(Number);
  const [ny, nm] = now.split("-").map(Number);
  return ny * 12 + nm - (ay * 12 + am) >= 2;
}

export function buildWalletOpsPrompts(
  input: WalletOpsInput,
  locale: UiLocale = "ja",
): OpsPrompt[] {
  const prompts: OpsPrompt[] = [];
  const name = input.display_name || input.person_id;
  const copy = walletOpsCopy(locale);

  if (input.lane === "envelope") {
    if (!input.envelope) {
      prompts.push({
        id: "envelope-missing",
        severity: "info",
        title: copy.envelopeMissingTitle,
        question: copy.envelopeMissingQuestion(name),
        hints: [copy.envelopeMissingHint1, copy.envelopeMissingHint2],
      });
    } else if (input.envelope.remaining_yen < 0) {
      const cats =
        input.envelope.over_categories.length > 0
          ? input.envelope.over_categories.join(copy.catJoin)
          : copy.envelopeOverSome;
      prompts.push({
        id: "envelope-over",
        severity: "critical",
        title: copy.envelopeOverTitle,
        question: copy.envelopeOverQuestion(name, cats),
        hints: [
          copy.envelopeOverHint1,
          copy.envelopeOverHint2,
          copy.envelopeOverHint3,
        ],
      });
    } else if (
      input.envelope.allocation_yen > 0 &&
      input.envelope.actual_yen === 0
    ) {
      prompts.push({
        id: "envelope-no-actual",
        severity: "info",
        title: copy.envelopeNoActualTitle,
        question: copy.envelopeNoActualQuestion(name),
        hints: [copy.envelopeNoActualHint1, copy.envelopeNoActualHint2],
      });
    }
  }

  if (input.lane === "payroll") {
    const p = input.payroll;
    if (!p || p.kind === "none") {
      prompts.push({
        id: "payroll-none",
        severity: "info",
        title: copy.payrollNoneTitle,
        question: copy.payrollNoneQuestion(name),
        hints: [copy.payrollNoneHint1, copy.payrollNoneHint2],
      });
    } else if (
      p.expected_monthly_yen > 0 &&
      p.actual_months === 0
    ) {
      prompts.push({
        id: "payroll-unbooked",
        severity: "warn",
        title: copy.payrollUnbookedTitle,
        question: copy.payrollUnbookedQuestion(name),
        hints: [copy.payrollUnbookedHint1, copy.payrollUnbookedHint2],
      });
    } else if (!p.ok && p.actual_months > 0) {
      const direction =
        p.actual_variance_yen > 0 ? copy.payrollOver : copy.payrollUnder;
      prompts.push({
        id: "payroll-mismatch",
        severity: "warn",
        title: copy.payrollMismatchTitle,
        question: copy.payrollMismatchQuestion(name, direction),
        hints: [
          copy.payrollMismatchHint1,
          copy.payrollMismatchHint2,
          copy.payrollMismatchHint3,
          copy.payrollMismatchHint4,
        ],
      });
    } else if (
      p.expected_monthly_yen > 0 &&
      countMidSeriesEmptyMonths(p.months) > 0
    ) {
      const holes = countMidSeriesEmptyMonths(p.months);
      prompts.push({
        id: "payroll-gaps",
        severity: "info",
        title: copy.payrollGapsTitle,
        question: copy.payrollGapsQuestion(name, holes),
        hints: [copy.payrollGapsHint1, copy.payrollGapsHint2],
      });
    }
  }

  if (input.company_payroll_ok === false) {
    prompts.push({
      id: "company-payroll-warn",
      severity: "warn",
      title: copy.companyPayrollWarnTitle,
      question: copy.companyPayrollWarnQuestion,
      hints: [copy.companyPayrollWarnHint1, copy.companyPayrollWarnHint2],
    });
  }

  if (isActualAsOfLagging(input.actual_as_of, input.now_month)) {
    prompts.push({
      id: "actuals-lag",
      severity: "warn",
      title: copy.actualsLagTitle,
      question: copy.actualsLagQuestion(input.actual_as_of ?? ""),
      hints: [copy.actualsLagHint1, copy.actualsLagHint2],
    });
  }

  // Cap to keep the rail scannable.
  return prompts.slice(0, 3);
}

/** Empty months between first and last booked actual month. */
export function countMidSeriesEmptyMonths(
  months?: Array<{ month: string; booked_yen: number; basis?: string }>,
): number {
  if (!months?.length) return 0;
  const actual = months
    .filter((m) => !m.basis || m.basis === "actual")
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month));
  const first = actual.findIndex((m) => m.booked_yen > 0);
  const last = (() => {
    for (let i = actual.length - 1; i >= 0; i -= 1) {
      if (actual[i]!.booked_yen > 0) return i;
    }
    return -1;
  })();
  if (first < 0 || last < 0 || last <= first) return 0;
  let holes = 0;
  for (let i = first + 1; i < last; i += 1) {
    if (actual[i]!.booked_yen === 0) holes += 1;
  }
  return holes;
}

export function buildCompanyPayrollPrompts(
  input: {
    ok: boolean;
    expected_monthly_yen: number;
    actual_months: number;
    empty_actual_months: number;
    actual_variance_yen: number;
    actual_as_of?: string | null;
    now_month?: string;
  },
  locale: UiLocale = "ja",
): OpsPrompt[] {
  const prompts: OpsPrompt[] = [];
  const copy = walletOpsCopy(locale);
  const yenLocale = locale === "en" ? "en-US" : "ja-JP";
  if (input.expected_monthly_yen > 0 && input.actual_months === 0) {
    prompts.push({
      id: "company-unbooked",
      severity: "warn",
      title: copy.companyUnbookedTitle,
      question: copy.companyUnbookedQuestion,
      hints: [copy.companyUnbookedHint1, copy.companyUnbookedHint2],
    });
  } else if (!input.ok && input.actual_months > 0) {
    prompts.push({
      id: "company-mismatch",
      severity: "warn",
      title: copy.companyMismatchTitle,
      question: copy.companyMismatchQuestion(
        `¥${Math.round(input.actual_variance_yen).toLocaleString(yenLocale)}`,
      ),
      hints: [
        copy.companyMismatchHint1,
        copy.companyMismatchHint2,
        copy.companyMismatchHint3,
      ],
    });
  } else if (input.empty_actual_months > 0 && input.expected_monthly_yen > 0) {
    // Rare when ok:true — empty months with expected>0 normally surface as mismatch (P2).
    prompts.push({
      id: "company-gaps",
      severity: "info",
      title: copy.companyGapsTitle,
      question: copy.companyGapsQuestion(input.empty_actual_months),
      hints: [copy.companyGapsHint1, copy.companyGapsHint2],
    });
  }
  if (isActualAsOfLagging(input.actual_as_of, input.now_month)) {
    prompts.push({
      id: "actuals-lag",
      severity: "warn",
      title: copy.actualsLagTitle,
      question: copy.actualsLagQuestion(input.actual_as_of ?? ""),
      hints: [copy.actualsLagHint1],
    });
  }
  return prompts.slice(0, 3);
}
