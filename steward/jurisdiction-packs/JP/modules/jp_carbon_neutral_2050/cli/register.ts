import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../../../src/lib/module-cli-factory.js";
import {
  MODULE_ID,
  runCarbonNeutralShow,
  runCarbonNeutralTargets,
  runCarbonNeutralValidate,
} from "./commands.js";

export { MODULE_ID };

export const jpCarbonNeutral2050Cli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(
      ctx.operationsCmd,
      "carbon-neutral",
      "Carbon neutral 2050 — declaration · interim targets · action plan",
      {
        show: runCarbonNeutralShow,
        validate: runCarbonNeutralValidate,
        action: {
          name: "targets",
          description: "Interim targets with the action plan that supports them",
          options: (cmd) => {
            cmd.option("--json", "JSON output");
          },
          run: (opts) => runCarbonNeutralTargets({ json: Boolean(opts.json) }),
        },
      }
    );
  },
  skillHandlers: {
    jp_carbon_neutral_show: (opts) => runCarbonNeutralShow({ json: Boolean(opts.json) }),
    jp_carbon_neutral_targets: (opts) => runCarbonNeutralTargets({ json: Boolean(opts.json) }),
  },
};
