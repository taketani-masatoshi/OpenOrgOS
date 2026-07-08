import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runSaasSubscriptionAction, runSaasSubscriptionShow, runSaasSubscriptionValidate } from "./commands.js";

export const MODULE_ID = "saas_subscription";

export const saas_subscriptionCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(ctx.operationsCmd, "saas", "SaaS subscription — MRR · renewals", {
      show: runSaasSubscriptionShow,
      validate: runSaasSubscriptionValidate,
      action: {
        name: "renewals",
        description: "Upcoming subscription renewals",
        run: runSaasSubscriptionAction,
      },
    });
  },
};
