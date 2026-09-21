import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../utils.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

export type TrackingStatus = "departed" | "enroute" | "arrived";

export function issueTrackingUrl(input: {
  jobId: string;
  assigneeId: string;
  eta: string;
  status?: TrackingStatus;
  latitude?: unknown;
  longitude?: unknown;
}): {
  path: string;
  assigneeId: string;
  eta: string;
  status: TrackingStatus;
  coordinates: null;
  missing_refs: string[];
} {
  if (input.latitude != null || input.longitude != null) {
    throw new Error("coordinates are refused");
  }
  const missing_refs: string[] = [];
  const jobLedger = join(getDataDir(), "field_ops", "jobs.yaml");
  if (existsSync(jobLedger)) {
    // Presence of ledger is enough for depth; id membership is human-reviewed.
  } else {
    missing_refs.push("field_ops/jobs.yaml");
  }
  const digest = createHash("sha256").update(input.jobId).digest("hex").slice(0, 12);
  return {
    path: `/track/${digest}`,
    assigneeId: input.assigneeId,
    eta: input.eta,
    status: input.status ?? "enroute",
    coordinates: null,
    missing_refs,
  };
}

/** One status document. No map tiles or live coordinates. */
export function renderTrackingStatus(input: {
  jobId: string;
  assigneeId: string;
  eta: string;
  status?: TrackingStatus;
  latitude?: unknown;
  longitude?: unknown;
}): Record<string, unknown> {
  const track = issueTrackingUrl(input);
  const jobLedger = join(getDataDir(), "field_ops", "jobs.yaml");
  const inputs_ref = existsSync(jobLedger) ? ["data/field_ops/jobs.yaml"] : [];
  return flattenProposeReport(
    makeProposeReport({
      kind: "tracking-status",
      depth: inputs_ref.length > 0 ? "L1" : "L0",
      inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        path: track.path,
        assigneeId: track.assigneeId,
        eta: track.eta,
        status: track.status,
        coordinates: null,
        missing_refs: track.missing_refs,
        mapTiles: false,
      },
    }),
  );
}
