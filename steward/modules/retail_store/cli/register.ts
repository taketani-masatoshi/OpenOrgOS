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
    const retail = ctx.operationsCmd.commands.find((cmd) => cmd.name() === "retail");
    retail
      ?.command("consume-propose")
      .description("Propose a stock decrement. Does not write on-hand")
      .requiredOption("--sku <id>", "SKU id")
      .requiredOption("--qty <n>", "Quantity", (value) => Number(value))
      .requiredOption("--on-hand <n>", "Current on-hand", (value) => Number(value))
      .action(async (opts: { sku: string; qty: number; onHand: number }) => {
        const { proposeConsumption } = await import("../../../../src/lib/propose-surface.js");
        console.log(JSON.stringify(proposeConsumption(opts.sku, opts.qty, opts.onHand)));
      });
    retail
      ?.command("reorder-propose")
      .description("Propose reorders for low stock. Does not send to a supplier")
      .requiredOption("--skus <json>", "JSON array of {id,stock_qty,threshold}")
      .action(async (opts: { skus: string }) => {
        const { renderStockReorderReport } = await import("../../../../src/lib/propose-surface.js");
        console.log(JSON.stringify(renderStockReorderReport(JSON.parse(opts.skus) as never)));
      });
  },
  skillHandlers: {
    retail_store_margin: (opts) =>
      runRetailStoreMargin({ store: opts.id, json: Boolean(opts.json) }),
    retail_store_show: (opts) => runRetailStoreShow({ json: Boolean(opts.json) }),
  },
};
