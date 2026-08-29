import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runPropertyManagementAction, runPropertyManagementShow, runPropertyManagementValidate } from "./commands.js";

export const MODULE_ID = "property_management";


function runModuleShowSkill(opts: SkillRunOptions): void {
  runPropertyManagementShow({ json: Boolean(opts.json) });
}

function runModuleValidateSkill(_opts: SkillRunOptions): void {
  runPropertyManagementValidate();
}

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
  skillHandlers: {
    property_management_ops: runModuleShowSkill,
    property_management_validate: runModuleValidateSkill,
  },
};
