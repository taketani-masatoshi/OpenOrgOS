import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runStaffingAction, runStaffingShow, runStaffingValidate } from "./commands.js";

export const MODULE_ID = "staffing";


function runModuleShowSkill(opts: SkillRunOptions): void {
  runStaffingShow({ json: Boolean(opts.json) });
}

function runModuleValidateSkill(_opts: SkillRunOptions): void {
  runStaffingValidate();
}

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
  skillHandlers: {
    staffing_ops: runModuleShowSkill,
    staffing_validate: runModuleValidateSkill,
  },
};
