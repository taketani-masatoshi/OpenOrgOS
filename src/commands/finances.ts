import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  loadMonthlyFinances,
  loadMonthlyFinance,
} from "../lib/data.js";
import { monthlyFinanceSchema } from "../../schemas/index.js";
import { writeTenantContentGuarded } from "../lib/org/fs-guard/guarded-write.js";
import { currentCanonicalSha256, isFsGuardEnforced } from "../lib/org/fs-guard/index.js";
import {
  buildPayrollMonthlyReconcile,
  formatPayrollReconcileMarkdown,
} from "../lib/finance/payroll-monthly-reconcile.js";
import { currentDate, writeMarkdownReport, getDataDir, writeYamlFile } from "../lib/utils.js";
import {
  financesSummary,
  formatFinancesSummaryMarkdown,
} from "../lib/report.js";
import {
  buildFinanceBriefing,
  formatFinanceBriefingMarkdown,
} from "../lib/finance-briefing.js";
import {
  buildCashBalanceView,
  formatCashBalanceMarkdown,
} from "../lib/cash-balance-view.js";
import { computeVarianceReport, formatVarianceMarkdown } from "../lib/variance.js";
import { auditCliMutation, requireCliDataWrite } from "../lib/console-auth/cli-operator.js";

export function runFinancesSummary(options: {
  from: string;
  to: string;
}): void {
  const finances = loadMonthlyFinances();
  const summary = financesSummary(finances, options.from, options.to);

  console.log(formatFinancesSummaryMarkdown(summary, options.from, options.to));
}

export function runFinancesBriefing(options?: { month?: string }): void {
  const brief = buildFinanceBriefing({ asOfMonth: options?.month });
  console.log(formatFinanceBriefingMarkdown(brief));
}

export function runFinancesCashBalance(options?: { json?: boolean }): void {
  const view = buildCashBalanceView();
  if (options?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(formatCashBalanceMarkdown(view));
  if (view.missing || view.total == null) {
    process.exitCode = 1;
  }
}

export function runFinancesAdd(options: {
  month: string;
  file: string;
}): void {
  requireCliDataWrite({ command: "finances add", permission: "escalate:plan" });
  const raw = readFileSync(options.file, "utf-8");
  const parsed = YAML.parse(raw);
  const entry = monthlyFinanceSchema.parse({ ...parsed, month: options.month });

  const logicalPath = `data/finance/monthly/${options.month}.yaml`;
  const yamlBody = YAML.stringify(entry);

  if (isFsGuardEnforced()) {
    const result = writeTenantContentGuarded({
      agentId: "finance",
      logicalPath,
      content: yamlBody,
      runId: `CLI-finances-add-${options.month}`,
      expectedSha256: currentCanonicalSha256(logicalPath),
    });
    auditCliMutation("finances add", options.month);
    console.log(`✓ Saved ${result} (fs-guard)`);
    return;
  }

  const path = join(getDataDir(), "finance", "monthly", `${options.month}.yaml`);
  writeYamlFile(path, entry);
  auditCliMutation("finances add", options.month);
  console.log(`✓ Saved ${path}`);
}

export function runFinancesReconcile(opts: { month?: string; output?: string; json?: boolean }): void {
  const report = buildPayrollMonthlyReconcile({ asOfYm: opts.month });
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
    return;
  }
  const md = formatPayrollReconcileMarkdown(report);
  if (opts.output) {
    requireCliDataWrite({ command: "finances reconcile", permission: "finance:reconcile" });
    const logical = `docs/reports/agent-summaries/finance/${opts.output}`;
    if (isFsGuardEnforced()) {
      const path = writeTenantContentGuarded({
        agentId: "finance",
        logicalPath: logical,
        content: md,
        runId: `CLI-finances-reconcile-${opts.month ?? currentDate().slice(0, 7)}`,
        expectedSha256: currentCanonicalSha256(logical),
      });
      auditCliMutation("finances reconcile", opts.output);
      console.log(`✓ ${path} (fs-guard)`);
    } else {
      const path = writeMarkdownReport("agent-summaries/finance", opts.output, md);
      auditCliMutation("finances reconcile", opts.output);
      console.log(`✓ ${path}`);
    }
    if (!report.ok) process.exitCode = 1;
    return;
  }
  console.log(md);
  if (!report.ok) process.exitCode = 1;
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

export { runFinancesCapitalRaiseCrossCheck } from "./finances-capital-raise-crosscheck.js";
