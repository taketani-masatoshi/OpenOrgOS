import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  loadMonthlyFinances,
  loadMonthlyFinance,
} from "../lib/data.js";
import { monthlyFinanceSchema } from "../../schemas/index.js";
import { getDataDir, writeYamlFile } from "../lib/utils.js";
import {
  financesSummary,
  formatFinancesSummaryMarkdown,
} from "../lib/report.js";
import { computeVarianceReport, formatVarianceMarkdown } from "../lib/variance.js";
import { writeMarkdownReport } from "../lib/utils.js";
import { auditCliMutation, requireCliDataWrite } from "../lib/console-auth/cli-operator.js";

export function runFinancesSummary(options: {
  from: string;
  to: string;
}): void {
  const finances = loadMonthlyFinances();
  const summary = financesSummary(finances, options.from, options.to);

  console.log(formatFinancesSummaryMarkdown(summary, options.from, options.to));
}

export function runFinancesAdd(options: {
  month: string;
  file: string;
}): void {
  requireCliDataWrite({ command: "finances add", permission: "escalate:plan" });
  const raw = readFileSync(options.file, "utf-8");
  const parsed = YAML.parse(raw);
  const entry = monthlyFinanceSchema.parse({ ...parsed, month: options.month });

  const path = join(getDataDir(), "finance", "monthly", `${options.month}.yaml`);
  writeYamlFile(path, entry);
  auditCliMutation("finances add", options.month);
  console.log(`✓ Saved ${path}`);
}

export function runFinancesList(): void {
  const finances = loadMonthlyFinances();

  if (finances.length === 0) {
    console.log("月次収支データがありません。");
    return;
  }

  console.log("Month".padEnd(10) + "Revenue".padEnd(15) + "Expenses".padEnd(15) + "Net");
  console.log("-".repeat(55));

  for (const f of finances) {
    const revenue = f.revenue.reduce((s, r) => s + r.amount, 0);
    const expenses = f.expenses.reduce((s, e) => s + e.amount, 0);
    console.log(
      f.month.padEnd(10) +
        String(revenue).padEnd(15) +
        String(expenses).padEnd(15) +
        String(revenue - expenses)
    );
  }
}

export function runFinancesShow(month: string): void {
  const finance = loadMonthlyFinance(month);
  if (!finance) {
    console.error(`月次データ ${month} が見つかりません。`);
    process.exit(1);
  }
  console.log(JSON.stringify(finance, null, 2));
}

export function runFinancesVariance(opts: { output?: string }): void {
  const report = computeVarianceReport("FY2026");
  const md = formatVarianceMarkdown(report);
  if (opts.output) {
    requireCliDataWrite({ command: "finances variance", permission: "escalate:plan" });
    const path = writeMarkdownReport("plans/variance", opts.output, md);
    auditCliMutation("finances variance", opts.output);
    console.log(`✓ ${path}`);
  } else {
    console.log(md);
  }
}
