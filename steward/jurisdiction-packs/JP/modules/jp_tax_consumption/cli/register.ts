import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import { runJpConsumptionTaxReturnSkill } from "../../../../../../src/lib/finance/tax-skill-runners.js";
import {
  runTaxConsumptionCalc,
  runTaxConsumptionCheck,
  runTaxConsumptionEligibility,
} from "../../../../../../src/commands/tax.js";

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
  },
  skillHandlers: {
    jp_consumption_tax_return: runJpConsumptionTaxReturnSkill,
  },
};
