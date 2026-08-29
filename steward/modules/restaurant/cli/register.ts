import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import {
  MODULE_ID,
  runRestaurantSeating,
  runRestaurantShow,
  runRestaurantValidate,
} from "./commands.js";

export { MODULE_ID };

export const restaurantCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(
      ctx.operationsCmd,
      "restaurant",
      "Restaurant — seating capacity · menu (restaurant module)",
      {
        show: runRestaurantShow,
        validate: runRestaurantValidate,
        action: {
          name: "seating",
          description: "Seat capacity by zone with the on-sale menu grouped by category",
          options: (cmd: Command) => {
            cmd.option("--json", "JSON output");
          },
          run: (opts) => runRestaurantSeating({ json: Boolean(opts.json) }),
        },
      }
    );
  },
  skillHandlers: {
    restaurant_seating: (opts) => runRestaurantSeating({ json: Boolean(opts.json) }),
    restaurant_show: (opts) => runRestaurantShow({ json: Boolean(opts.json) }),
  },
};
