import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import {
  MODULE_ID,
  runEducationEnrollment,
  runEducationShow,
  runEducationValidate,
} from "./commands.js";

export { MODULE_ID };

export const educationCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(
      ctx.operationsCmd,
      "education",
      "Education — courses · classes · enrollment",
      {
        show: runEducationShow,
        validate: runEducationValidate,
        action: {
          name: "enrollment",
          description: "Enrollment vs capacity utilization per course",
          options: (cmd) => {
            cmd.option("--json", "JSON output");
          },
          run: (opts) => runEducationEnrollment({ json: Boolean(opts.json) }),
        },
      }
    );
  },
  skillHandlers: {
    education_enrollment: (opts) => runEducationEnrollment({ json: Boolean(opts.json) }),
    education_show: (opts) => runEducationShow({ json: Boolean(opts.json) }),
  },
};
