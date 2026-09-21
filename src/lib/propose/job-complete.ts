export type JobCompletionProposal = {
  report: string;
  stockProposal: { sku: string; qty: number } | null;
  customerNoticeDraft: string;
  sent: false;
};

export function proposeJobCompletion(text: string, jobId: string): JobCompletionProposal {
  const skuQty = text.match(/sku:(\S+)\s+qty:(\d+)/);
  const ja = text.match(/([A-Za-z0-9_-]+)を(\d+)個/);
  const stockProposal = skuQty
    ? { sku: skuQty[1], qty: Number(skuQty[2]) }
    : ja
      ? { sku: ja[1], qty: Number(ja[2]) }
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
  channel: "mail" | "chat" | "voice_transcript" | "text";
  text: string;
  jobId: string;
  audio?: unknown;
}): JobCompletionProposal & { channel: typeof input.channel } {
  if (input.audio != null) throw new Error("audio bytes are refused");
  return { ...proposeJobCompletion(input.text, input.jobId), channel: input.channel };
}
