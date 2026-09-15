import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import { runJpWithholdingPaymentSkill } from "../../../../../../src/lib/finance/tax-skill-runners.js";
import { runTaxCalendar } from "../../../../../../src/commands/tax.js";
import {
  writePaymentSlipsDraft,
  writeWithholdingPaymentJournalDrafts,
} from "../../../../../../src/lib/finance/withholding-payments.js";

export const MODULE_ID = "jp_withholding_statutory";

export const jp_withholding_statutoryCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("withholding")
      .description("JP withholding / statutory calendar (jp_withholding_statutory)");

    cmd
      .command("calendar")
      .description("Expand withholding and social insurance rhythms")
      .option("--today <YYYY-MM-DD>")
      .option("--json")
      .action((opts: { today?: string; json?: boolean }) =>
        runTaxCalendar({ today: opts.today, json: Boolean(opts.json) }),
      );

    cmd
      .command("payment-journal-draft")
      .description("Draft journal lines for reward/fee withholding payments")
      .option("--year <YYYY>", "Calendar year")
      .option("--json")
      .action((opts: { year?: string; json?: boolean }) => {
        const year = Number.parseInt(opts.year ?? String(new Date().getFullYear()), 10);
        const result = writeWithholdingPaymentJournalDrafts(year);
        if (opts.json) console.log(JSON.stringify(result, null, 2));
        else console.log(`✓ 仕訳案 ${result.count} 件`);
      });

    cmd
      .command("payment-slips")
      .description("Payment slip amount draft (not filing XML)")
      .option("--year <YYYY>", "Calendar year")
      .option("--json")
      .action((opts: { year?: string; json?: boolean }) => {
        const year = Number.parseInt(opts.year ?? String(new Date().getFullYear()), 10);
        const { path, draft } = writePaymentSlipsDraft(year);
        if (opts.json) console.log(JSON.stringify({ path, draft }, null, 2));
        else {
          console.log(`✓ 支払調書ドラフト → ${path}`);
          for (const i of draft.issues) console.warn(`  ⚠ ${i}`);
        }
      });
  },
  skillHandlers: {
    jp_withholding_payment: runJpWithholdingPaymentSkill,
  },
};
