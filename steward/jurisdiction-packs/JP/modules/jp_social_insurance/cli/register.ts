import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import { loadPayroll } from "../../../../../../src/lib/data.js";
import {
  computeSocialInsurance,
} from "../../../../../../src/lib/finance/payroll-jp.js";

export const MODULE_ID = "jp_social_insurance";

function runSocialInsuranceSummary(opts: { month: string; json?: boolean }): void {
  const payroll = loadPayroll();
  const gross = payroll.employee_payroll?.monthly_gross_jpy ?? 0;
  const social = computeSocialInsurance({ grossYen: gross });
  const result = {
    month: opts.month,
    employee_count: payroll.employee_payroll?.employee_ids?.length ?? 0,
    standard_remuneration_yen: social.standard_remuneration_yen,
    health_insurance_employee_yen: social.health_employee_yen,
    health_insurance_employer_yen: social.health_employer_yen,
    pension_employee_yen: social.pension_employee_yen,
    pension_employer_yen: social.pension_employer_yen,
    employment_employee_yen: social.employment_employee_yen,
    employment_employer_yen: social.employment_employer_yen,
    employee_total_yen: social.employee_total_yen,
    employer_total_yen: social.employer_total_yen,
  };
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`# 社保サマリ ${opts.month}`);
  console.log(`標準報酬月額: ${result.standard_remuneration_yen.toLocaleString()} JPY`);
  console.log(`健保（本人/会社）: ${result.health_insurance_employee_yen.toLocaleString()} / ${result.health_insurance_employer_yen.toLocaleString()} JPY`);
  console.log(`厚年（本人/会社）: ${result.pension_employee_yen.toLocaleString()} / ${result.pension_employer_yen.toLocaleString()} JPY`);
  console.log(`雇用（本人/会社）: ${result.employment_employee_yen.toLocaleString()} / ${result.employment_employer_yen.toLocaleString()} JPY`);
  console.log(`対象人数: ${result.employee_count}`);
}

function runSocialInsuranceSkill(): void {
  const month = new Date().toISOString().slice(0, 7);
  runSocialInsuranceSummary({ month, json: false });
}

export const jp_social_insuranceCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("social-insurance")
      .description("JP social insurance prep (jp_social_insurance)");

    cmd
      .command("summary")
      .description("Social insurance summary for month")
      .requiredOption("--month <YYYY-MM>", "Target month")
      .option("--json", "Print JSON")
      .action(runSocialInsuranceSummary);
  },
  skillHandlers: {
    jp_social_insurance_prep: runSocialInsuranceSkill,
  },
};
