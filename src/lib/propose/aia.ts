import { scanBottlenecks, type StuckItem } from "./bottleneck.js";
import { proposeDispatch, type DispatchJob, type DispatchStaff } from "./dispatch.js";
import { scanFollowups, type DueItem } from "./followup.js";
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
    return flattenProposeReport(
      makeProposeReport({
        kind: "aia-cycle-report",
        depth: "L2",
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
