import type { SalesDeal } from "../../../schemas/sales.js";
import { loadSalesPipeline } from "../data.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

export type DueItem = { id: string; dueOn: string; kind: string };

export function scanFollowups(
  items: DueItem[],
  asOf: string,
  withinDays: number,
): Array<DueItem & { draft: string; sent: false }> {
  const start = Date.parse(`${asOf}T00:00:00Z`);
  const end = start + withinDays * 86_400_000;
  return items
    .filter((item) => {
      const due = Date.parse(`${item.dueOn}T00:00:00Z`);
      return due >= start && due <= end;
    })
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .map((item) => ({
      ...item,
      draft: `${item.id} の期日は ${item.dueOn} です。送信は人間の承認後です。`,
      sent: false as const,
    }));
}

/** Build due items from sales deals that carry next_action_due. */
export function dueItemsFromDeals(deals: SalesDeal[]): DueItem[] {
  return deals
    .filter((deal) => typeof deal.next_action_due === "string")
    .map((deal) => ({
      id: deal.id,
      dueOn: deal.next_action_due!,
      kind: "sales_deal",
    }));
}

/** One report. Reads sales pipeline when items are omitted. */
export function renderFollowupReport(
  items: DueItem[] | undefined,
  asOf: string,
  withinDays: number,
): Record<string, unknown> {
  const inputs_ref: string[] = [];
  let source = items;
  if (!source) {
    const deals = loadSalesPipeline()?.deals ?? [];
    if (deals.length > 0) inputs_ref.push("data/sales/pipeline.yaml");
    source = dueItemsFromDeals(deals);
  }
  const drafts = scanFollowups(source, asOf, withinDays);
  return flattenProposeReport(
    makeProposeReport({
      kind: "followup-report",
      depth: inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref,
      human_gate: { apply: "human", sent: false },
      payload: { asOf, withinDays, drafts, sent: false },
    }),
  );
}
