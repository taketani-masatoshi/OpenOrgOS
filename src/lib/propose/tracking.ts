import { createHash } from "node:crypto";
import {
  resolveFieldOpsJob,
  type FieldOpsJob,
} from "./field-ops-ledger.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

export type { FieldOpsJob } from "./field-ops-ledger.js";
export { loadFieldOpsJobs, resolveFieldOpsJob } from "./field-ops-ledger.js";

export type TrackingStatus = "departed" | "enroute" | "arrived";

export function issueTrackingUrl(input: {
  jobId: string;
  assigneeId?: string;
  eta?: string;
  status?: TrackingStatus;
  latitude?: unknown;
  longitude?: unknown;
  jobs?: FieldOpsJob[];
}): {
  path: string;
  assigneeId: string;
  eta: string;
  status: TrackingStatus;
  coordinates: null;
  missing_refs: string[];
  jobFound: boolean;
} {
  if (input.latitude != null || input.longitude != null) {
    throw new Error("coordinates are refused");
  }
  const resolved = resolveFieldOpsJob(input.jobId, input.jobs);
  const assigneeId = input.assigneeId ?? resolved.job?.assignee_id;
  const eta = input.eta ?? resolved.job?.eta;
  if (!assigneeId || !eta) {
    throw new Error("assigneeId and eta are required when the job ledger has no values");
  }
  const digest = createHash("sha256").update(input.jobId).digest("hex").slice(0, 12);
  return {
    path: `/track/${digest}`,
    assigneeId,
    eta,
    status: input.status ?? resolved.job?.status ?? "enroute",
    coordinates: null,
    missing_refs: resolved.missing_refs,
    jobFound: resolved.job != null,
  };
}

/** One status document. Job ledger ids only — no map tiles or live coordinates. */
export function renderTrackingStatus(input: {
  jobId: string;
  assigneeId?: string;
  eta?: string;
  status?: TrackingStatus;
  latitude?: unknown;
  longitude?: unknown;
  jobs?: FieldOpsJob[];
}): Record<string, unknown> {
  const track = issueTrackingUrl(input);
  const resolved = resolveFieldOpsJob(input.jobId, input.jobs);
  return flattenProposeReport(
    makeProposeReport({
      kind: "tracking-status",
      depth: resolved.inputs_ref.length > 0 ? "L2" : track.jobFound ? "L1" : "L0",
      inputs_ref: resolved.inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        path: track.path,
        assigneeId: track.assigneeId,
        eta: track.eta,
        status: track.status,
        coordinates: null,
        mapTiles: false,
        missing_refs: track.missing_refs,
        jobFound: track.jobFound,
      },
    }),
  );
}
