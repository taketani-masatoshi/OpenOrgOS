import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import {
  MODULE_ID,
  runClinicAppointments,
  runClinicShow,
  runClinicValidate,
} from "./commands.js";

export { MODULE_ID };

export const clinicCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(ctx.operationsCmd, "clinic", "Clinic — appointments · departments", {
      show: runClinicShow,
      validate: runClinicValidate,
      action: {
        name: "appointments",
        description: "Upcoming appointments with department names resolved",
        options: (cmd) => {
          cmd.option("--json", "JSON output");
        },
        run: (opts) => runClinicAppointments({ json: Boolean(opts.json) }),
      },
    });
  },
  skillHandlers: {
    clinic_appointments: (opts) => runClinicAppointments({ json: Boolean(opts.json) }),
    clinic_show: (opts) => runClinicShow({ json: Boolean(opts.json) }),
  },
};
