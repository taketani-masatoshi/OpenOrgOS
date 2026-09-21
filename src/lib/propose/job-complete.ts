import { makeProposeReport, flattenProposeReport } from "./report.js";

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
 */
export function renderFieldInterfaceReport(input: {
  channel: FieldChannel;
  text: string;
  jobId: string;
  audio?: unknown;
  photo?: unknown;
}): Record<string, unknown> {
  if (input.photo != null) throw new Error("photo bytes are refused");
  const accepted = acceptFieldReport(input);
  return flattenProposeReport(
    makeProposeReport({
      kind: "field-interface-report",
      depth: "L1",
      human_gate: { apply: "human", sent: false },
      payload: {
        channel: accepted.channel,
        report: accepted.report,
        stockProposal: accepted.stockProposal,
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
