/**
 * JP tax module filing boundary (ADR 0052).
 *
 * Tenant YAML / memos are fixtures for checking this module.
 * They do not define whether OrgOS may file.
 *
 * 5b — build an e-Tax / API-shaped payload from internal books.
 * 5c — send that payload only after human approval.
 * Unapproved artifacts stay `not-for-etax` so they cannot be treated as a live filing.
 */
export const ETAX_DRAFT_SUBMISSION = "not-for-etax" as const;
export const ETAX_APPROVED_SUBMISSION = "approved-to-submit" as const;

export type EtaxSubmissionState =
  | typeof ETAX_DRAFT_SUBMISSION
  | typeof ETAX_APPROVED_SUBMISSION;

export class EtaxSendNotApprovedError extends Error {
  readonly code = "etax_send_not_approved";

  constructor() {
    super("e-Tax external send requires user approval (ADR 0052 5c)");
    this.name = "EtaxSendNotApprovedError";
  }
}

export function taxModuleBoundaryNote(): string {
  return (
    "Prepare e-Tax/API payload from internal books and returns; " +
    "send externally only after user approval."
  );
}

export function authorizeEtaxExternalSend(opts: {
  humanApproved: boolean;
}): { submission: typeof ETAX_APPROVED_SUBMISSION } {
  if (!opts.humanApproved) {
    throw new EtaxSendNotApprovedError();
  }
  return { submission: ETAX_APPROVED_SUBMISSION };
}
