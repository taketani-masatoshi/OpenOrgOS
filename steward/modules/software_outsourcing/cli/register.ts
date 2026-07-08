import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runSoftwareOutsourcingAction, runSoftwareOutsourcingShow, runSoftwareOutsourcingValidate } from "./commands.js";

export const MODULE_ID = "software_outsourcing";

export const software_outsourcingCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(ctx.operationsCmd, "software-out", "Software outsourcing — SOW · milestones", {
      show: runSoftwareOutsourcingShow,
      validate: runSoftwareOutsourcingValidate,
      action: {
        name: "milestones-due",
        description: "Milestones due or overdue",
        run: runSoftwareOutsourcingAction,
      },
    });
  },
};
