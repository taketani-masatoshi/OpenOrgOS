import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runStaffingAction, runStaffingShow, runStaffingValidate } from "./commands.js";

export const MODULE_ID = "staffing";

export const staffingCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(ctx.operationsCmd, "staffing", "Staffing — assignments · utilization", {
      show: runStaffingShow,
      validate: runStaffingValidate,
      action: {
        name: "assignments",
        description: "Active staffing assignments",
        run: runStaffingAction,
      },
    });
  },
};
