import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runEventOperationsAction, runEventOperationsShow, runEventOperationsValidate } from "./commands.js";

export const MODULE_ID = "event_operations";


function runModuleShowSkill(opts: SkillRunOptions): void {
  runEventOperationsShow({ json: Boolean(opts.json) });
}

function runModuleValidateSkill(_opts: SkillRunOptions): void {
  runEventOperationsValidate();
}

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
  skillHandlers: {
    event_operations_ops: runModuleShowSkill,
    event_operations_validate: runModuleValidateSkill,
  },
};
