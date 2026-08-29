import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import {
  MODULE_ID,
  runLogisticsInTransit,
  runLogisticsShow,
  runLogisticsValidate,
} from "./commands.js";

export { MODULE_ID };

export const logisticsCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(
      ctx.operationsCmd,
      "logistics",
      "Logistics — warehouses · shipment SLA (logistics module)",
      {
        show: runLogisticsShow,
        validate: runLogisticsValidate,
        action: {
          name: "in-transit",
          description: "In-transit shipments with SLA dates, grouped by origin warehouse",
          options: (cmd: Command) => {
            cmd.option("--warehouse <id>", "Filter by origin warehouse id");
            cmd.option("--json", "JSON output");
          },
          run: (opts) =>
            runLogisticsInTransit({
              warehouse: typeof opts.warehouse === "string" ? opts.warehouse : undefined,
              json: Boolean(opts.json),
            }),
        },
      }
    );
  },
  skillHandlers: {
    logistics_delivery_sla: (opts) =>
      runLogisticsInTransit({ warehouse: opts.id, json: Boolean(opts.json) }),
    logistics_show: (opts) => runLogisticsShow({ json: Boolean(opts.json) }),
  },
};
