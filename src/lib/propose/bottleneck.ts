import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadOrgApprovalRegistry } from "../org/approval/registry.js";
import { getDataDir } from "../utils.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

export type StuckItem = { id: string; ownerId: string; waitingSince: string; kind: string };

export function scanBottlenecks(
  items: StuckItem[],
  asOf: string,
  stuckDays: number,
): Array<StuckItem & { stuckDays: number; notice: { text: string; notified: false } }> {
  const today = Date.parse(`${asOf}T00:00:00Z`);
  return items
    .map((item) => {
      const since = Date.parse(`${item.waitingSince}T00:00:00Z`);
      const days = Math.floor((today - since) / 86_400_000);
      return {
        ...item,
        stuckDays: days,
        notice: {
          text: `${item.id} は ${days} 日止まっています。通知は人間の承認後です。`,
          notified: false as const,
        },
      };
    })
    .filter((item) => item.stuckDays >= stuckDays)
    .sort((a, b) => b.stuckDays - a.stuckDays);
}

/** Build stuck items from pending approvals when present. */
export function stuckItemsFromPendingApprovals(): {
  items: StuckItem[];
  inputs_ref: string[];
} {
  const path = join(getDataDir(), "org", "pending-approvals.yaml");
  if (!existsSync(path)) return { items: [], inputs_ref: [] };
  try {
    const registry = loadOrgApprovalRegistry();
    const items: StuckItem[] = registry.approvals
      .filter((row) => row.status === "pending_approval")
      .map((row) => ({
        id: row.approval_id,
        ownerId: row.approver_id ?? row.proposed_by,
        waitingSince: row.proposed_at.slice(0, 10),
        kind: "approval",
      }));
    return { items, inputs_ref: ["data/org/pending-approvals.yaml"] };
  } catch {
    return { items: [], inputs_ref: [] };
  }
}

/** One report. Reads pending-approvals when items are omitted. Does not notify owners. */
export function renderBottleneckReport(
  items: StuckItem[] | undefined,
  asOf: string,
  stuckDays: number,
): Record<string, unknown> {
  const inputs_ref: string[] = [];
  let source = items;
  if (!source) {
    const loaded = stuckItemsFromPendingApprovals();
    source = loaded.items;
    inputs_ref.push(...loaded.inputs_ref);
  }
  return flattenProposeReport(
    makeProposeReport({
      kind: "bottleneck-report",
      depth: inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref,
      human_gate: { apply: "human", sent: false },
      payload: {
        asOf,
        stuckDaysThreshold: stuckDays,
        items: scanBottlenecks(source, asOf, stuckDays),
        notified: false,
      },
    }),
  );
}
