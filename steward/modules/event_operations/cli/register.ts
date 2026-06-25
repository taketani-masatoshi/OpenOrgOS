import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runEventOperationsAction, runEventOperationsShow, runEventOperationsValidate } from "./commands.js";

export const MODULE_ID = "event_operations";

export const event_operationsCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(ctx.operationsCmd, "events", "Event operations — run of show", {
      show: runEventOperationsShow,
      validate: runEventOperationsValidate,
      action: {
        name: "runbook",
        description: "Upcoming events runbook check",
        run: runEventOperationsAction,
      },
    });
  },
};
