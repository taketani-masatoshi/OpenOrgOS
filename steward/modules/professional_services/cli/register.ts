import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import type { SkillRunOptions } from "../../../../src/commands/skills.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runProfessionalServicesAction, runProfessionalServicesShow, runProfessionalServicesValidate } from "./commands.js";

export const MODULE_ID = "professional_services";


function runModuleShowSkill(opts: SkillRunOptions): void {
  runProfessionalServicesShow({ json: Boolean(opts.json) });
}

function runModuleValidateSkill(_opts: SkillRunOptions): void {
  runProfessionalServicesValidate();
}

export const professional_servicesCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(ctx.operationsCmd, "ps", "Professional services — projects · billing", {
      show: runProfessionalServicesShow,
      validate: runProfessionalServicesValidate,
      action: {
        name: "project_billing",
        description: "Active projects ready for monthly invoice",
        run: runProfessionalServicesAction,
      },
    });
  },
  skillHandlers: {
    professional_services_ops: runModuleShowSkill,
    professional_services_validate: runModuleValidateSkill,
  },
};
