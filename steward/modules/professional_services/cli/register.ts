import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import { runProfessionalServicesAction, runProfessionalServicesShow, runProfessionalServicesValidate } from "./commands.js";

export const MODULE_ID = "professional_services";

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
};
