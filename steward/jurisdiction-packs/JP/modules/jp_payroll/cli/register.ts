import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import { loadPayroll } from "../../../../../../src/lib/data.js";
import { postPayrollJournalEntry } from "../../../../../../src/lib/finance/journal-sources.js";
import { computePayrollMonth } from "../../../../../../src/lib/finance/payroll-jp.js";

export const MODULE_ID = "jp_payroll";

function runJpPayrollCalc(opts: { month: string; json?: boolean }): void {
  const payroll = loadPayroll();
  const gross = payroll.employee_payroll?.monthly_gross_jpy ?? 0;
  const result = computePayrollMonth({ month: opts.month, grossYen: gross });
  const summary = {
    month: result.month,
    gross_yen: result.gross_yen,
    withholding_yen: result.withholding_yen,
    social_employer_yen: result.social_insurance.employer_total_yen,
    social_employee_yen: result.social_insurance.employee_total_yen,
    net_pay_yen: result.net_pay_yen,
    employee_count: payroll.employee_payroll?.employee_ids?.length ?? 0,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# 給与計算 ${opts.month}`);
  console.log(`総支給: ${summary.gross_yen.toLocaleString()} JPY`);
  console.log(`源泉: ${summary.withholding_yen.toLocaleString()} JPY`);
  console.log(`社保（会社）: ${summary.social_employer_yen.toLocaleString()} JPY`);
  console.log(`社保（本人）: ${summary.social_employee_yen.toLocaleString()} JPY`);
  console.log(`差引支給: ${summary.net_pay_yen.toLocaleString()} JPY`);
  console.log(`対象人数: ${summary.employee_count}`);
}

function runJpPayrollPost(opts: { month: string; operatorId?: string }): void {
  const payroll = loadPayroll();
  const gross = payroll.employee_payroll?.monthly_gross_jpy ?? 0;
  const result = computePayrollMonth({ month: opts.month, grossYen: gross });
  const entryId = postPayrollJournalEntry({
    period: opts.month,
    authorizedBy: opts.operatorId ?? "jp-payroll-cli",
    grossYen: result.gross_yen,
    withholdingYen: result.withholding_yen,
    socialEmployerYen: result.social_insurance.employer_total_yen,
  });
  console.log(entryId ? `✓ posted ${entryId}` : "no payroll to post");
}

function runJpPayrollSkill(): void {
  const month = new Date().toISOString().slice(0, 7);
  runJpPayrollCalc({ month, json: false });
}

export const jp_payrollCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("payroll")
      .description("JP payroll calc (jp_payroll)");

    cmd
      .command("calc")
      .description("Calculate payroll summary for month")
      .requiredOption("--month <YYYY-MM>", "Payroll month")
      .option("--json", "Print JSON")
      .action(runJpPayrollCalc);

    cmd
      .command("post-journal")
      .description("Post payroll journal entry")
      .requiredOption("--month <YYYY-MM>", "Payroll month")
      .option("--operator-id <id>", "Operator id")
      .action(runJpPayrollPost);
  },
  skillHandlers: {
    jp_payroll_run: runJpPayrollSkill,
  },
};
