import { loadSalesPipeline } from "../data.js";
import {
  stuckItemsFromPendingApprovals,
  scanBottlenecks,
  type StuckItem,
} from "./bottleneck.js";
import { resolveDispatchInputs, proposeDispatch, type DispatchJob, type DispatchStaff } from "./dispatch.js";
import { dueItemsFromDeals, scanFollowups, type DueItem } from "./followup.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

/** One proposal list. Does not run a loop and does not execute. */
export function proposeAiaCycle(input: {
  followups: Array<{ id: string }>;
  bottlenecks: Array<{ id: string }>;
  dispatch: Array<{ jobId: string }>;
}): {
  proposals: Array<{ source: "followup" | "bottleneck" | "dispatch"; id: string; sent: false }>;
  executed: false;
  looping: false;
} {
  const proposals = [
    ...input.followups.map((item) => ({
      source: "followup" as const,
      id: item.id,
      sent: false as const,
    })),
    ...input.bottlenecks.map((item) => ({
      source: "bottleneck" as const,
      id: item.id,
      sent: false as const,
    })),
    ...input.dispatch.map((item) => ({
      source: "dispatch" as const,
      id: item.jobId,
      sent: false as const,
    })),
  ];
  return { proposals, executed: false, looping: false };
}

/**
 * Aggregate real scan outputs into one cycle report.
 * Id-list overload remains for tests via proposeAiaCycle.
 */
export function renderAiaCycleReport(
  input:
    | {
        followups: Array<{ id: string }>;
        bottlenecks: Array<{ id: string }>;
        dispatch: Array<{ jobId: string }>;
      }
    | {
        dueItems: DueItem[];
        stuckItems: StuckItem[];
        jobs: DispatchJob[];
        staff: DispatchStaff[];
        asOf: string;
        withinDays?: number;
        stuckDays?: number;
        inputs_ref?: string[];
      },
): Record<string, unknown> {
  if ("dueItems" in input) {
    const followups = scanFollowups(
      input.dueItems,
      input.asOf,
      input.withinDays ?? 7,
    ).map((row) => ({ id: row.id }));
    const bottlenecks = scanBottlenecks(
      input.stuckItems,
      input.asOf,
      input.stuckDays ?? 3,
    ).map((row) => ({ id: row.id }));
    const dispatch = proposeDispatch(input.jobs, input.staff)
      .filter((row) => row.staffId)
      .map((row) => ({ jobId: row.jobId }));
    const cycle = proposeAiaCycle({ followups, bottlenecks, dispatch });
    const inputs_ref = input.inputs_ref ?? [];
    return flattenProposeReport(
      makeProposeReport({
        kind: "aia-cycle-report",
        depth: inputs_ref.length > 0 ? "L2" : "L1",
        inputs_ref,
        human_gate: { apply: "human", executed: false, looping: false },
        payload: { ...cycle },
      }),
    );
  }
  const cycle = proposeAiaCycle(input);
  return flattenProposeReport(
    makeProposeReport({
      kind: "aia-cycle-report",
      depth: "L1",
      human_gate: { apply: "human", executed: false, looping: false },
      payload: { ...cycle },
    }),
  );
}

/**
 * Read sales pipeline, pending-approvals, and field_ops ledgers.
 * Omitting hand JSON → SoT path (depth L2 when any ledger is present).
 */
export function renderAiaCycleReportFromLedgers(opts: {
  asOf: string;
  withinDays?: number;
  stuckDays?: number;
}): Record<string, unknown> {
  const inputs_ref: string[] = [];
  const deals = loadSalesPipeline()?.deals ?? [];
  if (deals.length > 0) inputs_ref.push("data/sales/pipeline.yaml");
  const stuck = stuckItemsFromPendingApprovals();
  inputs_ref.push(...stuck.inputs_ref);
  const dispatch = resolveDispatchInputs({});
  inputs_ref.push(...dispatch.inputs_ref);
  return renderAiaCycleReport({
    dueItems: dueItemsFromDeals(deals),
    stuckItems: stuck.items,
    jobs: dispatch.jobs,
    staff: dispatch.staff,
    asOf: opts.asOf,
    withinDays: opts.withinDays,
    stuckDays: opts.stuckDays,
    inputs_ref,
  });
}
