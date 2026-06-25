import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runMembershipAction, runMembershipShow, runMembershipValidate } from "./commands.js";

export const MODULE_ID = "membership";

export const membershipCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(ctx.operationsCmd, "membership", "Membership — plans · renewals", {
      show: runMembershipShow,
      validate: runMembershipValidate,
      action: {
        name: "renewals",
        description: "Members due for renewal",
        run: runMembershipAction,
      },
    });
  },
};
