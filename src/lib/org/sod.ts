/**
 * Segregation of duties. Path: src/lib/org/sod.ts
 * Inspection and apply refusal. Does not assign a substitute approver.
 */

export type SodDuty = {
  action: "request" | "approve" | "purchase" | "accept";
  actorId: string;
  subjectId: string;
};

/** Same person must not hold both sides of a declared incompatible pair. */
export function findSodConflicts(
  duties: SodDuty[],
  pairs: Array<{ left: SodDuty["action"]; right: SodDuty["action"] }> = [
    { left: "request", right: "approve" },
    { left: "purchase", right: "accept" },
  ],
): string[] {
  const bySubject = new Map<string, SodDuty[]>();
  for (const duty of duties) {
    const list = bySubject.get(duty.subjectId) ?? [];
    list.push(duty);
    bySubject.set(duty.subjectId, list);
  }
  const issues: string[] = [];
  for (const [subjectId, list] of bySubject) {
    for (const pair of pairs) {
      const left = list.find((duty) => duty.action === pair.left);
      const right = list.find((duty) => duty.action === pair.right);
      if (!left || !right || left.actorId !== right.actorId) continue;
      const label =
        pair.left === "request" && pair.right === "approve"
          ? "requester and approver"
          : pair.left === "purchase" && pair.right === "accept"
            ? "purchaser and acceptor"
            : `${pair.left} and ${pair.right}`;
      issues.push(`${subjectId}: ${label} are ${left.actorId}`);
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
