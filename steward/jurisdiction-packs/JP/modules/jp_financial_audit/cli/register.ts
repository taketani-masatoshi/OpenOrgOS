import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  writeFinancialAuditConcludeStub,
  writeFinancialAuditPlanStub,
  writeFinancialAuditWorkpapers,
} from "../../../../../../src/lib/finance/financial-audit-workpapers.js";

export const MODULE_ID = "jp_financial_audit";

export const jp_financial_auditCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("financial-audit")
      .description("Internal financial assertion workpapers (jp_financial_audit · not external audit)");

    cmd
      .command("plan")
      .description("Write plan stub for period")
      .requiredOption("--period <YYYY|YYYY-MM>", "Calendar year or month")
      .option("--json")
      .action((opts: { period: string; json?: boolean }) => {
        const { path } = writeFinancialAuditPlanStub(opts.period);
        if (opts.json) console.log(JSON.stringify({ path }, null, 2));
        else console.log(`✓ plan stub → ${path}`);
      });

    cmd
      .command("workpapers")
      .description("Generate workpaper pack")
      .requiredOption("--period <YYYY|YYYY-MM>", "Calendar year or month")
      .option("--json")
      .action((opts: { period: string; json?: boolean }) => {
        const result = writeFinancialAuditWorkpapers(opts.period);
        if (opts.json) console.log(JSON.stringify(result, null, 2));
        else {
          console.log(`✓ workpapers ${result.paths.length} files`);
          for (const p of result.paths) console.log(`  ${p}`);
        }
      });

    cmd
      .command("conclude-stub")
      .description("Human conclusion stub (no machine verdict)")
      .requiredOption("--period <YYYY|YYYY-MM>", "Calendar year or month")
      .option("--json")
      .action((opts: { period: string; json?: boolean }) => {
        const { path } = writeFinancialAuditConcludeStub(opts.period);
        if (opts.json) console.log(JSON.stringify({ path }, null, 2));
        else console.log(`✓ conclude stub → ${path}`);
      });
  },
  skillHandlers: {},
};
