import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../utils.js";
import {
  loadFieldOpsJobs,
  type FieldOpsJob,
} from "./field-ops-ledger.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

export type { FieldOpsJob } from "./field-ops-ledger.js";
export { loadFieldOpsJobs } from "./field-ops-ledger.js";

export type TrackingStatus = "departed" | "enroute" | "arrived";

/** Resolve a job row; missing id is reported, not invented. */
export function resolveFieldOpsJob(
  jobId: string,
  jobs?: FieldOpsJob[],
): {
  job: FieldOpsJob | null;
  inputs_ref: string[];
  missing_refs: string[];
} {
  const loaded = jobs ? { jobs, inputs_ref: [] as string[] } : loadFieldOpsJobs();
  const job = loaded.jobs.find((row) => row.id === jobId) ?? null;
  const missing_refs: string[] = [];
  if (
    !jobs &&
    loaded.inputs_ref.length === 0 &&
    !existsSync(join(getDataDir(), "field_ops", "jobs.yaml"))
  ) {
    missing_refs.push("field_ops/jobs.yaml");
  } else if (!job) {
    missing_refs.push(`job:${jobId}`);
  }
  return { job, inputs_ref: loaded.inputs_ref, missing_refs };
}

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
  const resolved = resolveFieldOpsJob(input.jobId, input.jobs);
  const track = issueTrackingUrl(input);
  const depth = track.jobFound ? "L2" : resolved.inputs_ref.length > 0 ? "L1" : "L0";
  return flattenProposeReport(
    makeProposeReport({
      kind: "tracking-status",
      depth,
      inputs_ref: resolved.inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        path: track.path,
        jobId: input.jobId,
        assigneeId: track.assigneeId,
        eta: track.eta,
        status: track.status,
        jobFound: track.jobFound,
        coordinates: null,
        missing_refs: track.missing_refs,
        mapTiles: false,
      },
    }),
  );
}
