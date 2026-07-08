import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runRealEstateBrokerageAction, runRealEstateBrokerageShow, runRealEstateBrokerageValidate } from "./commands.js";

export const MODULE_ID = "real_estate_brokerage";

export const real_estate_brokerageCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(ctx.operationsCmd, "brokerage", "Real estate brokerage — listings · deals", {
      show: runRealEstateBrokerageShow,
      validate: runRealEstateBrokerageValidate,
      action: {
        name: "pipeline",
        description: "Deal pipeline by stage",
        run: runRealEstateBrokerageAction,
      },
    });
  },
};
