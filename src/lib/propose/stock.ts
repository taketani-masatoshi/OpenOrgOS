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
