import { existsSync, readFileSync } from "node:fs";
import { makeProposeReport, flattenProposeReport } from "./report.js";
import { proposeConsumption, skusFromRetailModule } from "./stock.js";
import { resolveFieldOpsJob } from "./tracking.js";

export type JobCompletionProposal = {
  report: string;
  stockProposal: { sku: string; qty: number } | null;
  customerNoticeDraft: string;
  sent: false;
};

export type FieldChannel = "mail" | "chat" | "voice_transcript" | "text";

export function proposeJobCompletion(text: string, jobId: string): JobCompletionProposal {
  const skuQty = text.match(/sku:(\S+)\s+qty:(\d+)/);
  const ja = text.match(/([A-Za-z0-9_-]+)を(\d+)個/);
  const stockProposal = skuQty
    ? { sku: skuQty[1]!, qty: Number(skuQty[2]) }
    : ja
      ? { sku: ja[1]!, qty: Number(ja[2]) }
      : null;
  return {
    report: text.trim(),
    stockProposal,
    customerNoticeDraft: `${jobId} の完了報告案。送信は人間の承認後。`,
    sent: false,
  };
}

/**
 * UTF-8 report text or text-file path.
 * Audio bytes / audio file paths are refused (live STT stays out of scope).
 */
export function loadFieldReportText(pathOrText: string): {
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

/** Preview next on-hand from retail SoT or an explicit map. Does not deduct. */
export function previewStockConsumption(
  stockProposal: { sku: string; qty: number } | null,
  onHandBySku?: Record<string, number>,
): {
  preview: { sku: string; onHand: number; nextQty: number; apply: "human" } | null;
  inputs_ref: string[];
} {
  if (!stockProposal) return { preview: null, inputs_ref: [] };
  if (onHandBySku && stockProposal.sku in onHandBySku) {
    const onHand = onHandBySku[stockProposal.sku]!;
    const proposed = proposeConsumption(stockProposal.sku, stockProposal.qty, onHand);
    return {
      preview: {
        sku: proposed.sku,
        onHand,
        nextQty: proposed.nextQty,
        apply: "human",
      },
      inputs_ref: [],
    };
  }
  const loaded = skusFromRetailModule();
  const row = loaded.skus.find((sku) => sku.id === stockProposal.sku);
  if (!row) return { preview: null, inputs_ref: loaded.inputs_ref };
  const proposed = proposeConsumption(stockProposal.sku, stockProposal.qty, row.stock_qty);
  return {
    preview: {
      sku: proposed.sku,
      onHand: row.stock_qty,
      nextQty: proposed.nextQty,
      apply: "human",
    },
    inputs_ref: loaded.inputs_ref,
  };
}

/** Mail, chat, or a voice transcript. Audio bytes are refused. */
export function acceptFieldReport(input: {
  channel: FieldChannel;
  text: string;
  jobId: string;
  audio?: unknown;
}): JobCompletionProposal & { channel: FieldChannel } {
  if (input.audio != null) throw new Error("audio bytes are refused");
  return { ...proposeJobCompletion(input.text, input.jobId), channel: input.channel };
}

/**
 * Canonical field IF report (photo/audio refused, no standing bot).
 * Prefer this over the legacy job-completion / intake aliases.
 * Resolves jobId against field_ops/jobs.yaml when present.
 */
export function renderFieldInterfaceReport(input: {
  channel: FieldChannel;
  text: string;
  jobId: string;
  audio?: unknown;
  photo?: unknown;
  onHandBySku?: Record<string, number>;
}): Record<string, unknown> {
  if (input.photo != null) throw new Error("photo bytes are refused");
  const loaded = loadFieldReportText(input.text);
  const accepted = acceptFieldReport({
    channel: input.channel,
    text: loaded.text,
    jobId: input.jobId,
    audio: input.audio,
  });
  const stock = previewStockConsumption(accepted.stockProposal, input.onHandBySku);
  const jobResolved = resolveFieldOpsJob(input.jobId);
  const inputs_ref = [...loaded.inputs_ref, ...stock.inputs_ref, ...jobResolved.inputs_ref];
  return flattenProposeReport(
    makeProposeReport({
      kind: "field-interface-report",
      depth: inputs_ref.length > 0 || stock.preview ? "L2" : "L1",
      inputs_ref,
      human_gate: { apply: "human", sent: false },
      payload: {
        channel: accepted.channel,
        jobId: input.jobId,
        jobFound: jobResolved.job != null,
        missing_refs: jobResolved.missing_refs,
        assigneeId: jobResolved.job?.assignee_id ?? null,
        report: accepted.report,
        stockProposal: accepted.stockProposal,
        stockPreview: stock.preview,
        customerNoticeDraft: accepted.customerNoticeDraft,
        sent: false,
        standingBot: false,
        liveSpeechToText: false,
        photoAccepted: false,
        stockDeducted: false,
      },
    }),
  );
}

/** @deprecated Use renderFieldInterfaceReport — kept as alias for CLI compatibility. */
export function renderJobCompletionReport(text: string, jobId: string): Record<string, unknown> {
  const report = renderFieldInterfaceReport({ channel: "text", text, jobId });
  return { ...report, kind: "job-completion-report" };
}

/** @deprecated Use renderFieldInterfaceReport — kept as alias for CLI compatibility. */
export function renderFieldIntakeReport(input: {
  channel: FieldChannel;
  text: string;
  jobId: string;
  audio?: unknown;
}): Record<string, unknown> {
  const report = renderFieldInterfaceReport(input);
  return { ...report, kind: "field-intake-report" };
}
