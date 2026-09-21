import { createHash } from "node:crypto";

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
} {
  if (input.latitude != null || input.longitude != null) {
    throw new Error("coordinates are refused");
  }
  const digest = createHash("sha256").update(input.jobId).digest("hex").slice(0, 12);
  return {
    path: `/track/${digest}`,
    assigneeId: input.assigneeId,
    eta: input.eta,
    status: input.status ?? "enroute",
    coordinates: null,
  };
}
