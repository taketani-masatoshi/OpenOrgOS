import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import { runJpWithholdingPaymentSkill } from "../../../../../../src/lib/finance/tax-skill-runners.js";
import { runTaxCalendar } from "../../../../../../src/commands/tax.js";

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
  },
  skillHandlers: {
    jp_withholding_payment: runJpWithholdingPaymentSkill,
  },
};
