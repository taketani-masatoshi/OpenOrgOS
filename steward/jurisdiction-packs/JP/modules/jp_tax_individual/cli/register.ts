import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import { loadChartOfAccounts } from "../../../../../../src/lib/data.js";
import { runJpIndividualIncomeTaxSkill } from "../../../../../../src/lib/finance/tax-skill-runners.js";
import { buildSolePropBlueReturn } from "../../../../../../src/lib/finance/sole-prop-blue-return.js";
import { buildSolePropIncomeTaxReturnDraft } from "../../../../../../src/lib/finance/sole-prop-income-tax-return.js";

export const MODULE_ID = "jp_tax_individual";

export const jp_tax_individualCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("tax-individual")
      .description("Sole-prop blue return and income tax drafts (not for filing)");

    cmd
      .command("accounts")
      .description("Show owner capital account codes")
      .action(() => {
        const coa = loadChartOfAccounts();
        console.log(JSON.stringify(coa.journal_source_accounts ?? {}, null, 2));
      });

    cmd
      .command("kessan")
      .description("Blue return general-use draft")
      .requiredOption("--fy <FY####>")
      .action((opts: { fy: string }) => {
        console.log(JSON.stringify(buildSolePropBlueReturn(opts.fy), null, 2));
      });

    cmd
      .command("income-tax")
      .description("Income tax draft from the blue return")
      .requiredOption("--fy <FY####>")
      .action((opts: { fy: string }) => {
        console.log(JSON.stringify(buildSolePropIncomeTaxReturnDraft(opts.fy), null, 2));
      });

    cmd
      .command("handoff")
      .description("Remind that filing stays with a human")
      .action(() => {
        console.log("提出は人間。このコマンドは送信しない。");
      });
  },
  skillHandlers: {
    jp_individual_income_tax: runJpIndividualIncomeTaxSkill,
  },
};
