import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runSoftwareOutsourcingAction, runSoftwareOutsourcingShow, runSoftwareOutsourcingValidate } from "./commands.js";

export const MODULE_ID = "software_outsourcing";


function runModuleShowSkill(opts: SkillRunOptions): void {
  runSoftwareOutsourcingShow({ json: Boolean(opts.json) });
}

function runModuleValidateSkill(_opts: SkillRunOptions): void {
  runSoftwareOutsourcingValidate();
}

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
  skillHandlers: {
    software_outsourcing_ops: runModuleShowSkill,
    software_outsourcing_validate: runModuleValidateSkill,
  },
};
