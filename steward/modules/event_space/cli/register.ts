import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import {
  MODULE_ID,
  runEventSpaceShow,
  runEventSpaceUtilization,
  runEventSpaceValidate,
} from "./commands.js";

export { MODULE_ID };

export const eventSpaceCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(
      ctx.operationsCmd,
      "event-space",
      "Event space — spaces · bookings · utilization",
      {
        show: runEventSpaceShow,
        validate: runEventSpaceValidate,
        action: {
          name: "utilization",
          description: "Booked hours, utilization and revenue per space",
          options: (cmd) => {
            cmd.option("--json", "JSON output");
          },
          run: (opts) => runEventSpaceUtilization({ json: Boolean(opts.json) }),
        },
      }
    );
  },
  skillHandlers: {
    event_space_utilization: (opts) => runEventSpaceUtilization({ json: Boolean(opts.json) }),
    event_space_show: (opts) => runEventSpaceShow({ json: Boolean(opts.json) }),
  },
};
