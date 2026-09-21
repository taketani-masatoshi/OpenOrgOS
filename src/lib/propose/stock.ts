import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  retailSkusFileSchema,
  SKU_STATUS_ACTIVE,
} from "../../../steward/modules/retail_store/cli/schema.js";
import { loadModuleDataFile } from "../module-business-data.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

export function proposeConsumption(
  sku: string,
  qty: number,
  onHand: number,
): { sku: string; nextQty: number; apply: "human" } {
  return { sku, nextQty: onHand - qty, apply: "human" };
}

/** Next quantity changes only when a human sets apply. Nothing is sent. */
export function applyConsumption(input: {
  sku: string;
  qty: number;
  onHand: number;
  apply: boolean;
}): { sku: string; nextQty: number; applied: boolean; sent: false } {
  return {
    sku: input.sku,
    nextQty: input.apply ? input.onHand - input.qty : input.onHand,
    applied: input.apply,
    sent: false,
  };
}

export function proposeReorder(
  skus: Array<{ id: string; stock_qty: number; threshold: number }>,
): Array<{ sku: string; qty: number; apply: "human" }> {
  return skus
    .filter((sku) => sku.stock_qty <= sku.threshold)
    .map((sku) => ({
      sku: sku.id,
      qty: sku.threshold - sku.stock_qty + 1,
      apply: "human" as const,
    }));
}

/** Load active SKUs from retail_store module data. */
export function skusFromRetailModule(threshold = DEFAULT_LOW_STOCK_THRESHOLD): {
  skus: Array<{ id: string; stock_qty: number; threshold: number }>;
  inputs_ref: string[];
} {
  try {
    const file = loadModuleDataFile("retail_store", "skus.yaml", retailSkusFileSchema);
    const skus =
      file?.data.skus
        .filter((s) => s.status === SKU_STATUS_ACTIVE && s.stock_qty !== undefined)
        .map((s) => ({
          id: s.id,
          stock_qty: s.stock_qty as number,
          threshold,
        })) ?? [];
    return {
      skus,
      inputs_ref: skus.length > 0 ? ["modules/retail_store/skus.yaml"] : [],
    };
  } catch {
    return { skus: [], inputs_ref: [] };
  }
}

/** One report. Proposals only — no real deduct and no supplier send. */
export function renderStockReorderReport(
  skus?: Array<{ id: string; stock_qty: number; threshold: number }>,
): Record<string, unknown> {
  const inputs_ref: string[] = [];
  let source = skus;
  if (!source) {
    const loaded = skusFromRetailModule();
    source = loaded.skus;
    inputs_ref.push(...loaded.inputs_ref);
  }
  return flattenProposeReport(
    makeProposeReport({
      kind: "stock-reorder-report",
      depth: inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref,
      human_gate: { apply: "human", sent: false },
      payload: {
        proposals: proposeReorder(source),
        deducted: false,
        sent: false,
      },
    }),
  );
}
