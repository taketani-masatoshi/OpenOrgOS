import type { SkillRunOptions } from "../../commands/skills.js";
import {
  runJpBankCashflowGenerate,
  runJpBankPositionSkill,
} from "../../../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/lib.js";

/** Treasury extension skill — delegates to jp_bank_corporate position show. */
export function runTreasuryCashPositionSkill(_opts: SkillRunOptions): void {
  runJpBankPositionSkill({ json: false });
}

/** Treasury extension skill — delegates to jp_bank_corporate cashflow generate. */
export function runTreasuryLiquidityForecastSkill(opts: SkillRunOptions): void {
  runJpBankCashflowGenerate({
    granularity: "weekly",
    horizon: "13w",
    format: "md",
    write: "write" in opts && opts.write === true,
  });
}
