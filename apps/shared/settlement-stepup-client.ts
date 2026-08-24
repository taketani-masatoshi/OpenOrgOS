import type { SettlementPasskeyChallenge } from "./SettlementPasskeyModal";

export class ConsoleApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly stepUpRequired: boolean;

  constructor(
    message: string,
    opts: { status: number; code?: string; stepUpRequired?: boolean }
  ) {
    super(message);
    this.name = "ConsoleApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.stepUpRequired = Boolean(opts.stepUpRequired || opts.code === "step_up_required");
  }
}

export type SettlementApi = <T>(path: string, init?: RequestInit) => Promise<T>;

export function isSettlementStepUpError(err: unknown): boolean {
  if (err instanceof ConsoleApiError) {
    return err.stepUpRequired || err.status === 409;
  }
  if (err && typeof err === "object" && "code" in err) {
    if ((err as { code?: unknown }).code === "step_up_required") return true;
  }
  if (err && typeof err === "object" && "stepUpRequired" in err) {
    if ((err as { stepUpRequired?: unknown }).stepUpRequired === true) return true;
  }
  if (err instanceof Error) {
    return (
      err.message.includes("step_up_required") ||
      err.message.includes("settlement PassKey") ||
      err.message.includes("決済 PassKey")
    );
  }
  return false;
}

/**
 * Try approve; on tier B/C step-up, create challenge and run UI ceremony
 * (`SettlementPasskeyModal` → `/chat/v1/settlement/complete`).
 */
export async function approveWithSettlementCeremony(opts: {
  api: SettlementApi;
  approvalId: string;
  coApproverId?: string;
  tryApprove: () => Promise<unknown>;
  runCeremony: (challenge: SettlementPasskeyChallenge) => Promise<void>;
}): Promise<unknown> {
  try {
    return await opts.tryApprove();
  } catch (err) {
    if (!isSettlementStepUpError(err)) throw err;
  }

  const challenge = await opts.api<SettlementPasskeyChallenge & { ok?: boolean }>(
    "/chat/v1/settlement/challenge",
    {
      method: "POST",
      body: JSON.stringify({
        approval_id: opts.approvalId,
        ...(opts.coApproverId ? { co_approver_id: opts.coApproverId } : {}),
      }),
    }
  );
  await opts.runCeremony(challenge);
  return { ok: true, approval_id: opts.approvalId, settlement: true };
}
