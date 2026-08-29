import {
  buildTaxCalendarPortfolio,
  formatAmountEstimate,
} from "../lib/finance/tax-calendar-portfolio.js";
import { buildFinanceTaxCalendarViewModel } from "../lib/canvas-views/builders/finance-tax-calendar.js";
import {
  buildConsumptionTaxSummary,
  formatConsumptionTaxCheckMarkdown,
  formatConsumptionTaxMarkdown,
  resolveConsumptionTaxMethod,
  resolveDeemedPurchaseRatePct,
  runConsumptionTaxCheck,
} from "../lib/finance/consumption-tax.js";
import {
  assessConsumptionRefundEligibility,
  formatConsumptionTaxEligibilityMarkdown,
} from "../lib/finance/consumption-tax-eligibility.js";
import { loadTaxProfile } from "../lib/data.js";
import {
  formatDepreciationVerifyMarkdown,
  verifyAllFixedAssetDepreciation,
} from "../lib/finance/depreciation.js";
import {
  assessInvoiceRegistration,
  assessQualifiedInvoiceIssuance,
  formatInvoiceRegistrationMarkdown,
  formatQualifiedInvoiceIssuanceMarkdown,
} from "../lib/finance/invoice-qualified.js";
import {
  computeTaxReadiness,
  formatTaxReadinessMarkdown,
} from "../lib/finance/tax-readiness.js";
import { runTaxAdvisorHandoffDraft } from "../lib/finance/tax-advisor-handoff.js";
import { runTaxGapResolve, type GapResolveStatus } from "../lib/finance/tax-gap-admin.js";
import {
  formatTaxFilingGapsBriefLines,
  summarizeTaxFilingGaps,
  tryLoadTaxFilingGaps,
} from "../lib/finance/tax-filing-gaps.js";
import { currentDate } from "../lib/utils.js";

export function runTaxCalendar(opts?: { today?: string; json?: boolean }): void {
  const today = opts?.today ?? currentDate();
  const portfolio = buildTaxCalendarPortfolio({ today });
  if (opts?.json) {
    console.log(JSON.stringify(portfolio, null, 2));
    return;
  }
  console.log(`# 税務カレンダー — ${today}\n`);
  console.log(
    `先3ヶ月概算流出: ${formatAmountEstimate(portfolio.stats.outflow_3m_jpy)}`,
  );
  console.log("");
  console.log("| 期限 | 税目 | 概算 | 状態 |");
  console.log("| --- | --- | --- | --- |");
  for (const row of portfolio.rows.filter((r) => r.deadline >= today).slice(0, 20)) {
    console.log(
      `| ${row.deadline} | ${row.tax} | ${
        row.amount_estimate_jpy != null
          ? formatAmountEstimate(row.amount_estimate_jpy)
          : "—"
      } | ${row.status ?? "—"} |`,
    );
  }
}

export function runTaxCalendarView(opts?: {
  today?: string;
  companyName?: string;
  json?: boolean;
}): void {
  const vm = buildFinanceTaxCalendarViewModel({
    reportDate: opts?.today,
    companyName: opts?.companyName,
  });
  if (opts?.json) {
    console.log(JSON.stringify(vm, null, 2));
    return;
  }
  console.log(`# ${vm.title}`);
  console.log(vm.summary ?? "");
}

export function runTaxGaps(opts?: { json?: boolean }): void {
  const gaps = tryLoadTaxFilingGaps();
  const summary = summarizeTaxFilingGaps(gaps);
  if (opts?.json) {
    console.log(JSON.stringify({ summary, gaps }, null, 2));
    return;
  }
  console.log("# 申告準備ギャップ\n");
  if (!gaps) {
    console.log("tax-filing-gaps.yaml がありません（任意 overlay）");
    return;
  }
  console.log(`as_of: ${gaps.as_of ?? "—"} · fiscal_year: ${gaps.fiscal_year ?? "—"}`);
  console.log(
    `open ${summary.open} / deferred ${summary.deferred} / total ${summary.total}（blocking ${summary.blocking} · warning ${summary.warning} · advisor_pending ${summary.advisor_pending}）`,
  );
  for (const line of formatTaxFilingGapsBriefLines(gaps, 20)) {
    console.log(line.startsWith("- ") ? line : `- ${line}`);
  }
}

export function runTaxConsumptionCheck(opts?: { json?: boolean }): void {
  const result = runConsumptionTaxCheck();
  if (opts?.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(formatConsumptionTaxCheckMarkdown(result));
}

export function runTaxDepreciation(opts?: { json?: boolean }): void {
  const result = verifyAllFixedAssetDepreciation();
  if (opts?.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(formatDepreciationVerifyMarkdown(result));
}

function resolveConsumptionCalcOptions(opts: {
  method?: "standard" | "simplified";
  deemedRate?: number;
  transitionalRate?: 80 | 50 | 100;
}) {
  let profile: ReturnType<typeof loadTaxProfile> | undefined;
  try {
    profile = loadTaxProfile();
  } catch {
    /* optional */
  }
  return {
    method: resolveConsumptionTaxMethod(profile, opts.method),
    deemedPurchaseRatePct: resolveDeemedPurchaseRatePct(profile, opts.deemedRate),
    manual: opts.transitionalRate
      ? { transitional_deduction_rate_pct: opts.transitionalRate }
      : undefined,
  };
}

export function runTaxConsumptionCalc(opts: {
  period: string;
  method?: "standard" | "simplified";
  deemedRate?: number;
  transitionalRate?: 80 | 50 | 100;
  json?: boolean;
}): void {
  const resolved = resolveConsumptionCalcOptions(opts);
  const summary = buildConsumptionTaxSummary({
    period: opts.period,
    method: resolved.method,
    deemedPurchaseRatePct: resolved.deemedPurchaseRatePct,
    manual: resolved.manual,
  });
  if (opts?.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(formatConsumptionTaxMarkdown(summary));
}

export function runTaxConsumptionEligibility(opts: {
  period: string;
  method?: "standard" | "simplified";
  deemedRate?: number;
  json?: boolean;
}): void {
  const resolved = resolveConsumptionCalcOptions(opts);
  const summary = buildConsumptionTaxSummary({
    period: opts.period,
    method: resolved.method,
    deemedPurchaseRatePct: resolved.deemedPurchaseRatePct,
    manual: resolved.manual,
  });
  const eligibility = assessConsumptionRefundEligibility({ summary });
  if (opts?.json) {
    console.log(JSON.stringify(eligibility, null, 2));
    return;
  }
  console.log(formatConsumptionTaxEligibilityMarkdown(eligibility));
}

export function runTaxInvoiceRegistrationCheck(opts?: { json?: boolean }): void {
  const result = assessInvoiceRegistration();
  if (opts?.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(formatInvoiceRegistrationMarkdown(result));
}

export function runTaxQualifiedInvoiceCheck(opts?: { json?: boolean }): void {
  const result = assessQualifiedInvoiceIssuance();
  if (opts?.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(formatQualifiedInvoiceIssuanceMarkdown(result));
}

export function runTaxReadiness(opts?: { json?: boolean }): void {
  const result = computeTaxReadiness();
  if (opts?.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(formatTaxReadinessMarkdown(result));
}

export function runTaxHandoff(opts?: {
  json?: boolean;
  operator?: string;
  fiscalYear?: string;
}): void {
  runTaxAdvisorHandoffDraft(opts);
}

export function runTaxGapResolveCommand(opts: {
  id: string;
  status: GapResolveStatus;
  notes?: string;
  json?: boolean;
}): void {
  runTaxGapResolve(opts);
}
