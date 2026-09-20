import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadYojitsuFyPlan } from "../lib/data.js";
import { getDocsReportsDir } from "../lib/utils.js";
import { closeAccountingYear } from "../lib/finance/annual-close.js";
import { closeAccountingMonth } from "../lib/finance/monthly-close.js";
import { requireCliDataWrite } from "../lib/console-auth/cli-operator.js";
import {
  fiscalYearEndDate,
  fiscalYearStartMonth,
  lastDayOfMonth,
  nextFiscalYear,
  resolveCompanyFiscalYearEndMonth,
} from "../lib/finance/fiscal-year.js";

export function runFinancesClose(opts: {
  month?: string;
  fiscalYear?: string;
  operatorId?: string;
  postDepreciation?: boolean;
  postPayroll?: boolean;
  output?: string;
}): void {
  const auth = requireCliDataWrite({
    command: "finances close",
    permission: "finance:reconcile",
  });

  if (opts.fiscalYear) {
    runAnnualClose(opts.fiscalYear, auth.record.operator_id, opts.output);
    return;
  }

  const month = opts.month;
  if (!month) {
    console.error("Provide --month YYYY-MM or --fiscal-year");
    process.exit(1);
  }

  const closed = closeAccountingMonth({
    month,
    operatorId: auth.record.operator_id,
    postDepreciation: opts.postDepreciation,
    postPayroll: opts.postPayroll,
  });
  const trialItem = closed.evaluation.items.find((item) => item.id === "trial-balance");
  const reconcileItem = closed.evaluation.items.find(
    (item) => item.id === "monthly-reconcile",
  );
  const lines = [
    `# 月次決算 ${month}`,
    "",
    `as_of: ${closed.evaluation.as_of}`,
    `posted_entries: ${closed.posted_entry_ids.length}`,
    `trial_balanced: ${trialItem?.pass === true}`,
    `monthly_reconcile_balanced: ${reconcileItem?.pass === true}`,
    `can_lock: ${closed.evaluation.can_lock}`,
    `locked: ${closed.locked}`,
    "",
    "## Posted",
    ...closed.posted_entry_ids.map((id) => `- ${id}`),
    "",
    "## Gate errors",
    ...closed.evaluation.errors.map((issue) => `- ${issue}`),
    "",
    "## Warnings",
    ...closed.evaluation.warnings.map((issue) => `- ${issue}`),
  ];
  const md = lines.join("\n");
  if (opts.output) {
    const dir = join(getDocsReportsDir(), "agent-summaries", "accounting");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, opts.output);
    writeFileSync(path, md, "utf-8");
    console.log(`✓ ${path}`);
  } else {
    console.log(md);
  }
}

export function resolveFiscalYearCloseDates(fiscalYear: string): {
  asOf: string;
  nextFiscalYear: string;
  nextPeriodStart: string;
} {
  const yojitsu = loadYojitsuFyPlan(fiscalYear);
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const rawAsOf = yojitsu?.period_to;
  const asOf = rawAsOf
    ? rawAsOf.length === 7
      ? lastDayOfMonth(rawAsOf)
      : rawAsOf
    : fiscalYearEndDate(fiscalYear, endMonth);
  const nextFy = nextFiscalYear(fiscalYear);
  const nextPeriodStart = (() => {
    if (yojitsu?.period_to) {
      const end = asOf.slice(0, 7);
      const [y, m] = end.split("-").map(Number);
      const next = new Date(y, m, 1);
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    }
    return fiscalYearStartMonth(nextFy, endMonth);
  })();
  return {
    asOf,
    nextFiscalYear: nextFy,
    nextPeriodStart,
  };
}

function runAnnualClose(
  fiscalYear: string,
  authorizedBy: string,
  output?: string,
): void {
  const closed = closeAccountingYear({ fiscalYear, operatorId: authorizedBy });
  const lines = [
    `# 年次決算 ${fiscalYear}`,
    "",
    `as_of: ${closed.evaluation.as_of}`,
    `can_close: ${closed.evaluation.can_close}`,
    `posted_entries: ${closed.posted_entry_ids.length}`,
    `opening_proposal: ${closed.opening_proposal_path ?? "not written"}`,
    "",
    "## Posted",
    ...closed.posted_entry_ids.map((id) => `- ${id}`),
    "",
    "## Gate errors",
    ...closed.evaluation.errors.map((issue) => `- ${issue}`),
  ];
  const md = lines.join("\n");
  if (output) {
    const dir = join(getDocsReportsDir(), "agent-summaries", "accounting");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, output), md, "utf-8");
  }
  console.log(md);
}
