/** Reference id only. Photo bytes are refused. Approval stays human. */
export function proposeExpenseIntake(input: {
  channel: "line" | "slack" | "mail" | "chat";
  referenceId: string;
  amountYen?: number;
  photo?: unknown;
}): {
  channel: string;
  referenceId: string;
  apply: "human";
  claim: {
    referenceId: string;
    claimId?: string;
    amountYen?: number;
    status: "proposal";
  };
} {
  if (input.photo != null) throw new Error("photo bytes are refused");
  if (!/^[A-Za-z0-9-]{3,64}$/.test(input.referenceId)) {
    throw new Error("referenceId must be an id, not a document body");
  }
  const claimId = /^ECL-\d{8}-\d{3}$/.test(input.referenceId) ? input.referenceId : undefined;
  return {
    channel: input.channel,
    referenceId: input.referenceId,
    apply: "human",
    claim: {
      referenceId: input.referenceId,
      claimId,
      amountYen: input.amountYen,
      status: "proposal",
    },
  };
}
