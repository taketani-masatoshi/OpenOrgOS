import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import { runJpCorporateTaxReturnSkill } from "../../../../../../src/lib/finance/tax-skill-runners.js";
import {
  runTaxCalendar,
  runTaxDepreciation,
  runTaxGaps,
} from "../../../../../../src/commands/tax.js";
import { writeCorporateTaxXmlDraft } from "../../../../../../src/lib/finance/jp-corporate-tax-xml.js";

export const MODULE_ID = "jp_tax_corporate";

export const jp_tax_corporateCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("tax-corporate")
      .description("JP corporate tax filing prep (jp_tax_corporate)");

    cmd
      .command("calendar")
      .description("Expand obligation calendar")
      .option("--today <YYYY-MM-DD>")
      .option("--json")
      .action((opts: { today?: string; json?: boolean }) =>
        runTaxCalendar({ today: opts.today, json: Boolean(opts.json) }),
      );

    cmd
      .command("gaps")
      .description("List tax filing gaps")
      .option("--json")
      .action((opts: { json?: boolean }) => runTaxGaps({ json: Boolean(opts.json) }));

    cmd
      .command("depreciation")
      .description("Verify fixed asset depreciation")
      .option("--json")
      .action((opts: { json?: boolean }) =>
        runTaxDepreciation({ json: Boolean(opts.json) }),
      );

    cmd
      .command("xml-draft")
      .description(
        "Write corporate tax XML draft for advisor handoff (ADR 0052 Phase 5b · not e-Tax submit)",
      )
      .option("--fiscal-year <FY>", "Fiscal year e.g. FY2026")
      .option("--as-of <YYYY-MM-DD>", "Statement as-of date")
      .option("--json", "Print JSON")
      .action((opts: { fiscalYear?: string; asOf?: string; json?: boolean }) => {
        const draft = writeCorporateTaxXmlDraft({
          fiscalYear: opts.fiscalYear,
          asOf: opts.asOf,
        });
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                fiscal_year: draft.fiscal_year,
                as_of: draft.as_of,
                path: draft.absolute_path,
                relative_path: draft.relative_path,
                submission: draft.submission,
              },
              null,
              2,
            ),
          );
          return;
        }
        console.log(
          `✓ Corporate tax XML draft → ${draft.absolute_path} (${draft.submission})`,
        );
      });
  },
  skillHandlers: {
    jp_corporate_tax_return: runJpCorporateTaxReturnSkill,
  },
};
