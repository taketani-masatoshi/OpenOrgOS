import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runSaasSubscriptionAction, runSaasSubscriptionShow, runSaasSubscriptionValidate } from "./commands.js";

export const MODULE_ID = "saas_subscription";


function runModuleShowSkill(opts: SkillRunOptions): void {
  runSaasSubscriptionShow({ json: Boolean(opts.json) });
}

function runModuleValidateSkill(_opts: SkillRunOptions): void {
  runSaasSubscriptionValidate();
}

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
  skillHandlers: {
    saas_subscription_ops: runModuleShowSkill,
    saas_subscription_validate: runModuleValidateSkill,
  },
};
