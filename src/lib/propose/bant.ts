import { existsSync, readFileSync } from "node:fs";
import type { SalesDeal } from "../../../schemas/sales.js";
import { salesDealStageSchema } from "../../../schemas/sales.js";
import { loadSalesPipeline } from "../data.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

export type BantProposal = {
  budget?: string;
  authority?: string;
  need?: string;
  timing?: string;
  proposedStage: "qualify" | "propose" | "stay";
  apply: "human";
  invoked: false;
};

export function extractBant(transcript: string): BantProposal {
  const budget = transcript.match(/予算[:：]\s*([^\n]+)/)?.[1]?.trim();
  const authority = transcript.match(/決裁[:：]\s*([^\n]+)/)?.[1]?.trim();
  const need = transcript.match(/ニーズ[:：]\s*([^\n]+)/)?.[1]?.trim();
  const timing = transcript.match(/時期[:：]\s*([^\n]+)/)?.[1]?.trim();
  const filled = [budget, authority, need, timing].filter(Boolean).length;
  const proposedStage = filled >= 3 ? "propose" : filled >= 1 ? "qualify" : "stay";
  return {
    budget,
    authority,
    need,
    timing,
    proposedStage,
    apply: "human",
    invoked: false,
  };
}

/**
 * UTF-8 transcript text or text-file path. Audio / live STT is refused.
 */
export function loadBantTranscriptInput(pathOrText: string): {
  text: string;
  inputs_ref: string[];
} {
  if (existsSync(pathOrText)) {
    if (/\.(wav|mp3|m4a|webm|ogg|flac)$/i.test(pathOrText)) {
      throw new Error("audio STT is out of scope; pass a UTF-8 transcript text file");
    }
    return {
      text: readFileSync(pathOrText, "utf8"),
      inputs_ref: [pathOrText],
    };
  }
  return { text: pathOrText, inputs_ref: [] };
}

/** Map BANT propose/qualify/stay onto sales deal stages without applying. */
export function mapBantToDealStage(
  proposedStage: BantProposal["proposedStage"],
): string {
  if (proposedStage === "propose") return salesDealStageSchema.parse("proposal");
  if (proposedStage === "qualify") return salesDealStageSchema.parse("qualify");
  return "stay";
}

/** One report. Optionally binds to a deal id from the sales pipeline. */
export function renderBantReport(
  transcriptOrPath: string,
  opts?: { dealId?: string; deals?: SalesDeal[] },
): Record<string, unknown> {
  const loaded = loadBantTranscriptInput(transcriptOrPath);
  const bant = extractBant(loaded.text);
  const deals = opts?.deals ?? loadSalesPipeline()?.deals ?? [];
  const inputs_ref = [...loaded.inputs_ref];
  let deal: SalesDeal | undefined;
  if (opts?.dealId) {
    deal = deals.find((row) => row.id === opts.dealId);
    if (deals.length > 0 && !opts.deals) inputs_ref.push("data/sales/pipeline.yaml");
  }
  const mappedStage = mapBantToDealStage(bant.proposedStage);
  const depth =
    inputs_ref.length > 0 || (opts?.dealId && deal) ? "L2" : "L1";
  return flattenProposeReport(
    makeProposeReport({
      kind: "bant-report",
      depth,
      inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        ...bant,
        dealId: opts?.dealId ?? null,
        currentStage: deal?.stage ?? null,
        mappedStage,
        invoked: false,
        liveStt: false,
      },
    }),
  );
}
