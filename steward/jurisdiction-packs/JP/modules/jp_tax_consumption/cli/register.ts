import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import { runJpConsumptionTaxReturnSkill } from "../../../../../../src/lib/finance/tax-skill-runners.js";
import {
  runTaxConsumptionCalc,
  runTaxConsumptionCheck,
  runTaxConsumptionDraftReturn,
  runTaxConsumptionEligibility,
} from "../../../../../../src/commands/tax.js";
import { postConsumptionTaxYearEndReclass } from "../../../../../../src/lib/finance/consumption-tax-year-end.js";
import { resolveSolePropCalendarYear } from "../../../../../../src/lib/finance/sole-prop-year.js";

export const MODULE_ID = "jp_tax_consumption";

export const jp_tax_consumptionCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const cmd = ctx.operationsCmd
      .command("tax-consumption")
      .description("JP consumption tax (jp_tax_consumption)");

    cmd
      .command("check")
      .description("Verify consumption tax classification")
      .option("--json")
      .action((opts: { json?: boolean }) =>
        runTaxConsumptionCheck({ json: Boolean(opts.json) }),
      );

    cmd
      .command("calc")
      .description("Consumption tax summary for period")
      .requiredOption("--period <YYYY-MM>", "Tax period")
      .option("--method <method>", "standard or simplified")
      .option("--deemed-rate <pct>", "Simplified deemed purchase rate", (v: string) => Number(v))
      .option("--transitional-rate <pct>", "80, 50, or 100", (v) => Number(v) as 80 | 50 | 100)
      .option("--json")
      .action((opts: {
        period: string;
        method?: string;
        deemedRate?: number;
        transitionalRate?: 80 | 50 | 100;
        json?: boolean;
      }) =>
        runTaxConsumptionCalc({
          period: opts.period,
          method: opts.method === "simplified" ? "simplified" : opts.method === "standard" ? "standard" : undefined,
          deemedRate: opts.deemedRate,
          transitionalRate: opts.transitionalRate,
          json: Boolean(opts.json),
        }),
      );

    cmd
      .command("eligibility")
      .description("Refund claim-kind gates (does not file)")
      .requiredOption("--period <YYYY-MM>", "Tax period")
      .option("--method <method>", "standard or simplified")
      .option("--deemed-rate <pct>", "Simplified deemed purchase rate", (v: string) => Number(v))
      .option("--json")
      .action((opts: {
        period: string;
        method?: string;
        deemedRate?: number;
        json?: boolean;
      }) =>
        runTaxConsumptionEligibility({
          period: opts.period,
          method: opts.method === "simplified" ? "simplified" : opts.method === "standard" ? "standard" : undefined,
          deemedRate: opts.deemedRate,
          json: Boolean(opts.json),
        }),
      );

    cmd
      .command("draft-return")
      .description("Annual consumption tax amount draft (not e-Tax XML)")
      .option("--year <YYYY>", "Calendar year (personal / CY)")
      .option("--fy <YYYY>", "Alias of --year for corp FY end calendar year")
      .option("--json")
      .action((opts: { year?: string; fy?: string; json?: boolean }) =>
        runTaxConsumptionDraftReturn({
          year: opts.year ?? opts.fy,
          json: Boolean(opts.json),
        }),
      );

    cmd
      .command("year-end-reclass")
      .description("Reclass 仮受/仮払 to 未払消費税 (idempotent JE-CT-YE-{year})")
      .option("--year <YYYY>", "Calendar year")
      .option("--json")
      .action((opts: { year?: string; json?: boolean }) => {
        const y = resolveSolePropCalendarYear({ explicit: opts.year });
        const result = postConsumptionTaxYearEndReclass({ calendarYear: y });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        if (result.posted) {
          console.log(
            `✓ year-end-reclass ${result.entry_id} · ネット ${result.net_payable_yen.toLocaleString("ja-JP")} 円`,
          );
        } else {
          console.log(`skip ${result.entry_id}: ${result.skipped}`);
        }
      });
  },
  skillHandlers: {
    jp_consumption_tax_return: runJpConsumptionTaxReturnSkill,
  },
};
