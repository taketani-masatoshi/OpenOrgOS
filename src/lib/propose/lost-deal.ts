import type { SalesDeal } from "../../../schemas/sales.js";
import { OPEN_SALES_STAGES } from "../../../schemas/sales.js";
import { loadSalesPipeline } from "../data.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

export function draftLostDealFollowup(input: { dealId: string; silentDays: number }): {
  dealId: string;
  subject: string;
  draft: string;
  sent: false;
  channel: null;
} {
  const subject = `${input.dealId} フォロー文案`;
  return {
    dealId: input.dealId,
    subject,
    draft: `${input.dealId} は ${input.silentDays} 日動きがありません。フォロー文案です。送信は人間の承認後です。`,
    sent: false,
    channel: null,
  };
}

function silentDaysSince(stageEnteredOn: string | undefined, asOf: string): number | null {
  if (!stageEnteredOn) return null;
  const start = Date.parse(`${stageEnteredOn}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.floor((end - start) / 86_400_000);
}

const OPEN_STAGES = new Set<string>(OPEN_SALES_STAGES);

/** Deals stuck in an open stage past silentDays threshold. */
export function scanSilentDeals(
  deals: SalesDeal[],
  asOf: string,
  silentDaysThreshold: number,
): Array<{ dealId: string; silentDays: number; stage: string }> {
  return deals
    .filter((deal) => OPEN_STAGES.has(deal.stage))
    .map((deal) => {
      const silentDays = silentDaysSince(deal.stage_entered_on, asOf);
      return silentDays == null
        ? null
        : { dealId: deal.id, silentDays, stage: deal.stage };
    })
    .filter((row): row is { dealId: string; silentDays: number; stage: string } =>
      row != null && row.silentDays >= silentDaysThreshold,
    )
    .sort((a, b) => b.silentDays - a.silentDays);
}

/** One report. Reads sales pipeline when deals are omitted. Does not push. */
export function renderLostDealFollowupReport(input: {
  dealId?: string;
  silentDays?: number;
  asOf?: string;
  silentDaysThreshold?: number;
  deals?: SalesDeal[];
}): Record<string, unknown> {
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  const threshold = input.silentDaysThreshold ?? 14;
  const fromPipeline = input.deals == null;
  const pipelineDeals = input.deals ?? loadSalesPipeline()?.deals ?? [];
  const inputs_ref: string[] = [];

  if (input.dealId != null && input.silentDays != null) {
    const draft = draftLostDealFollowup({
      dealId: input.dealId,
      silentDays: input.silentDays,
    });
    return flattenProposeReport(
      makeProposeReport({
        kind: "lost-deal-followup-report",
        depth: fromPipeline && pipelineDeals.length > 0 ? "L2" : "L0",
        inputs_ref:
          fromPipeline && pipelineDeals.length > 0 ? ["data/sales/pipeline.yaml"] : [],
        human_gate: { apply: "human", sent: false },
        payload: { ...draft, predicted: false, candidates: [] },
      }),
    );
  }

  if (fromPipeline && pipelineDeals.length > 0) {
    inputs_ref.push("data/sales/pipeline.yaml");
  }
  const candidates = scanSilentDeals(pipelineDeals, asOf, threshold);
  const top = candidates[0];
  const draft = top
    ? draftLostDealFollowup({ dealId: top.dealId, silentDays: top.silentDays })
    : {
        dealId: "",
        subject: "失注フォロー候補なし",
        draft: "停滞商談はありません。",
        sent: false as const,
        channel: null,
      };

  return flattenProposeReport(
    makeProposeReport({
      kind: "lost-deal-followup-report",
      depth: inputs_ref.length > 0 || candidates.length > 0 ? "L2" : "L0",
      inputs_ref,
      human_gate: { apply: "human", sent: false },
      payload: {
        ...draft,
        predicted: false,
        asOf,
        silentDaysThreshold: threshold,
        candidates,
      },
    }),
  );
}
