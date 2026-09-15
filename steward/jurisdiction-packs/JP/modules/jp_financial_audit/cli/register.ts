import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  writeFinancialAuditConcludeStub,
  writeFinancialAuditPlanStub,
  writeFinancialAuditWorkpapers,
} from "../../../../../../src/lib/finance/financial-audit-workpapers.js";
import {
  assessPresentationSanity,
  formatPresentationSanityMarkdown,
} from "../../../../../../src/lib/finance/financial-presentation-sanity.js";
import { resolveSolePropPeriod } from "../../../../../../src/lib/finance/sole-prop-year.js";
import { getDocsDir, writeTrackedFile } from "../../../../../../src/lib/utils.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

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

    cmd
      .command("presentation-sanity")
      .description("Display sanity: owner-draw sign, total jump vs journal hash")
      .option("--period <YYYY|YYYY-MM>", "Calendar year or month (default: setup.calendar_year)")
      .option("--update-baseline", "Write presentation-snapshot.yaml")
      .option("--json")
      .action((opts: { period?: string; updateBaseline?: boolean; json?: boolean }) => {
        const period = resolveSolePropPeriod({ explicit: opts.period });
        const result = assessPresentationSanity({
          period,
          updateBaseline: Boolean(opts.updateBaseline),
        });
        const dir = join(getDocsDir(), "audit", "financial", period);
        mkdirSync(dir, { recursive: true });
        const path = writeTrackedFile(
          join(dir, "presentation-sanity.md"),
          formatPresentationSanityMarkdown(result),
        );
        if (opts.json) {
          console.log(JSON.stringify({ path, result }, null, 2));
          return;
        }
        console.log(`✓ presentation-sanity → ${path}`);
        for (const f of result.findings) {
          console.log(`  [${f.level}] ${f.code}: ${f.message}`);
        }
      });
  },
  skillHandlers: {},
};
