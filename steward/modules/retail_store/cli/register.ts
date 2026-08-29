import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import { registerStandardModuleCommands } from "../../../../src/lib/module-cli-factory.js";
import {
  MODULE_ID,
  runRetailStoreMargin,
  runRetailStoreShow,
  runRetailStoreValidate,
} from "./commands.js";

export { MODULE_ID };

function parseLowStock(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export const retailStoreCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerStandardModuleCommands(
      ctx.operationsCmd,
      "retail",
      "Retail store — SKU margin · stock (retail_store module)",
      {
        show: runRetailStoreShow,
        validate: runRetailStoreValidate,
        action: {
          name: "margin",
          description: "Active SKU margin and stock value grouped by store, with low-stock flags",
          options: (cmd: Command) => {
            cmd.option("--store <id>", "Filter by store id");
            cmd.option("--low-stock <qty>", "Low-stock threshold (on-hand units)");
            cmd.option("--json", "JSON output");
          },
          run: (opts) =>
            runRetailStoreMargin({
              store: typeof opts.store === "string" ? opts.store : undefined,
              lowStock: parseLowStock(opts.lowStock),
              json: Boolean(opts.json),
            }),
        },
      }
    );
  },
  skillHandlers: {
    retail_store_margin: (opts) =>
      runRetailStoreMargin({ store: opts.id, json: Boolean(opts.json) }),
    retail_store_show: (opts) => runRetailStoreShow({ json: Boolean(opts.json) }),
  },
};
