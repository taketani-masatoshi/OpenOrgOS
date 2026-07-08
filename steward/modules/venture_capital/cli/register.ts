import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runVentureCapitalAction, runVentureCapitalShow, runVentureCapitalValidate } from "./commands.js";

export const MODULE_ID = "venture_capital";

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
};
