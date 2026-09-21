/**
 * Segregation of duties. Path: src/lib/org/sod.ts
 * Inspection and apply refusal. Does not assign a substitute approver.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getDataDir, readYamlFile } from "../utils.js";
import { makeProposeReport, flattenProposeReport } from "../propose/report.js";

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

const pendingApprovalRowSchema = z.object({
  id: z.string().optional(),
  subject_ref: z.string().optional(),
  requester_id: z.string().optional(),
  approver_id: z.string().optional(),
  purchaser_id: z.string().optional(),
  acceptor_id: z.string().optional(),
});

const pendingApprovalsFileSchema = z.object({
  approvals: z.array(pendingApprovalRowSchema).default([]),
});

/** Build duties from pending-approvals.yaml when present. */
export function dutiesFromPendingApprovals(): {
  duties: SodDuty[];
  inputs_ref: string[];
} {
  const path = join(getDataDir(), "org", "pending-approvals.yaml");
  if (!existsSync(path)) return { duties: [], inputs_ref: [] };
  try {
    const file = readYamlFile(path, pendingApprovalsFileSchema);
    const duties: SodDuty[] = [];
    for (const row of file.approvals) {
      const subjectId = row.subject_ref ?? row.id ?? "approval";
      if (row.requester_id) {
        duties.push({ action: "request", actorId: row.requester_id, subjectId });
      }
      if (row.approver_id) {
        duties.push({ action: "approve", actorId: row.approver_id, subjectId });
      }
      if (row.purchaser_id) {
        duties.push({ action: "purchase", actorId: row.purchaser_id, subjectId });
      }
      if (row.acceptor_id) {
        duties.push({ action: "accept", actorId: row.acceptor_id, subjectId });
      }
    }
    return {
      duties,
      inputs_ref: duties.length > 0 ? ["data/org/pending-approvals.yaml"] : [],
    };
  } catch {
    return { duties: [], inputs_ref: [] };
  }
}

/** One report. Does not name a substitute approver. */
export function renderSodReport(
  duties?: SodDuty[],
  pairs?: Array<{ left: SodDuty["action"]; right: SodDuty["action"] }>,
): Record<string, unknown> {
  const inputs_ref: string[] = [];
  let source = duties;
  if (!source) {
    const loaded = dutiesFromPendingApprovals();
    source = loaded.duties;
    inputs_ref.push(...loaded.inputs_ref);
  }
  const issues = findSodConflicts(source, pairs);
  return flattenProposeReport(
    makeProposeReport({
      kind: "sod-report",
      depth: inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        ok: issues.length === 0,
        issues,
        substitute: null,
      },
    }),
  );
}
