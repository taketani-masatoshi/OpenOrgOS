import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runPropertyManagementAction, runPropertyManagementShow, runPropertyManagementValidate } from "./commands.js";

export const MODULE_ID = "property_management";

export const property_managementCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(ctx.operationsCmd, "property-mgmt", "Property management — contracts · service requests", {
      show: runPropertyManagementShow,
      validate: runPropertyManagementValidate,
      action: {
        name: "open-requests",
        description: "Open service requests and SLA breaches",
        run: runPropertyManagementAction,
      },
    });
  },
};
