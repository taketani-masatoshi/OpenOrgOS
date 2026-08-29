import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runEcommerceAction, runEcommerceShow, runEcommerceValidate } from "./commands.js";

export const MODULE_ID = "ecommerce";


function runModuleShowSkill(opts: SkillRunOptions): void {
  runEcommerceShow({ json: Boolean(opts.json) });
}

function runModuleValidateSkill(_opts: SkillRunOptions): void {
  runEcommerceValidate();
}

export const ecommerceCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(ctx.operationsCmd, "ecommerce", "E-commerce — orders · fulfillment", {
      show: runEcommerceShow,
      validate: runEcommerceValidate,
      action: {
        name: "fulfillment",
        description: "Orders pending fulfillment",
        run: runEcommerceAction,
      },
    });
  },
  skillHandlers: {
    ecommerce_ops: runModuleShowSkill,
    ecommerce_validate: runModuleValidateSkill,
  },
};
