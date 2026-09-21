/**
 * Segregation of duties. Path: src/lib/org/sod.ts
 * Inspection and apply refusal. Does not assign a substitute approver.
 */

export type SodDuty = {
  action: "request" | "approve" | "purchase" | "accept";
  actorId: string;
  subjectId: string;
};

/** Same person must not both request and approve, or both purchase and accept. */
export function findSodConflicts(duties: SodDuty[]): string[] {
  const bySubject = new Map<string, SodDuty[]>();
  for (const duty of duties) {
    const list = bySubject.get(duty.subjectId) ?? [];
    list.push(duty);
    bySubject.set(duty.subjectId, list);
  }
  const issues: string[] = [];
  for (const [subjectId, list] of bySubject) {
    const requester = list.find((duty) => duty.action === "request");
    const approver = list.find((duty) => duty.action === "approve");
    if (requester && approver && requester.actorId === approver.actorId) {
      issues.push(`${subjectId}: requester and approver are ${requester.actorId}`);
    }
    const purchaser = list.find((duty) => duty.action === "purchase");
    const acceptor = list.find((duty) => duty.action === "accept");
    if (purchaser && acceptor && purchaser.actorId === acceptor.actorId) {
      issues.push(`${subjectId}: purchaser and acceptor are ${purchaser.actorId}`);
    }
  }
  return issues;
}

export function assertSodAllowsApply(duties: SodDuty[]): void {
  const issues = findSodConflicts(duties);
  if (issues.length > 0) throw new Error(`sod refused: ${issues.join("; ")}`);
}

export function assertPurchaserIsNotAcceptor(approval: {
  purchaser_id?: string;
  acceptor_id?: string;
  subject_ref?: string;
}): void {
  if (!approval.purchaser_id || !approval.acceptor_id) return;
  assertSodAllowsApply([
    {
      action: "purchase",
      actorId: approval.purchaser_id,
      subjectId: approval.subject_ref ?? "approval",
    },
    {
      action: "accept",
      actorId: approval.acceptor_id,
      subjectId: approval.subject_ref ?? "approval",
    },
  ]);
}
