import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runMembershipAction, runMembershipShow, runMembershipValidate } from "./commands.js";

export const MODULE_ID = "membership";


function runModuleShowSkill(opts: SkillRunOptions): void {
  runMembershipShow({ json: Boolean(opts.json) });
}

function runModuleValidateSkill(_opts: SkillRunOptions): void {
  runMembershipValidate();
}

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
  skillHandlers: {
    membership_ops: runModuleShowSkill,
    membership_validate: runModuleValidateSkill,
  },
};
