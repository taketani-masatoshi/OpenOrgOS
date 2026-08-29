import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runVentureCapitalAction, runVentureCapitalShow, runVentureCapitalValidate } from "./commands.js";

export const MODULE_ID = "venture_capital";


function runModuleShowSkill(opts: SkillRunOptions): void {
  runVentureCapitalShow({ json: Boolean(opts.json) });
}

function runModuleValidateSkill(_opts: SkillRunOptions): void {
  runVentureCapitalValidate();
}

export const venture_capitalCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(ctx.operationsCmd, "vc", "Venture capital — funds · portfolio", {
      show: runVentureCapitalShow,
      validate: runVentureCapitalValidate,
      action: {
        name: "ic-summary",
        description: "IC / portfolio summary",
        run: runVentureCapitalAction,
      },
    });
  },
  skillHandlers: {
    venture_capital_ops: runModuleShowSkill,
    venture_capital_validate: runModuleValidateSkill,
  },
};
