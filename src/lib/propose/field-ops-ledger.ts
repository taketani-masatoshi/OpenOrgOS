/**
 * Field ops ledgers shared by tracking and dispatch.
 * Path: src/lib/propose/field-ops-ledger.ts
 * No GPS coordinates.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getDataDir, readYamlFile } from "../utils.js";

export const fieldOpsJobSchema = z.object({
  id: z.string().min(1),
  assignee_id: z.string().min(1).optional(),
  eta: z.string().min(1).optional(),
  status: z.enum(["departed", "enroute", "arrived"]).optional(),
  waypoint: z.string().min(1).optional(),
  /** Required for dispatch proposals from the ledger. */
  skill: z.string().min(1).optional(),
  /** Optional minutes for field analytics (no GPS). */
  work_minutes: z.number().int().min(0).optional(),
  travel_minutes: z.number().int().min(0).optional(),
});

export const fieldOpsJobsFileSchema = z.object({
  version: z.literal(1).default(1),
  jobs: z.array(fieldOpsJobSchema).default([]),
});

export type FieldOpsJob = z.output<typeof fieldOpsJobSchema>;

export const fieldOpsStaffSchema = z.object({
  id: z.string().min(1),
  skills: z.array(z.string().min(1)).default([]),
  free: z.boolean().default(true),
  waypoint: z.string().min(1).optional(),
  load: z.number().int().min(0).default(0),
});

export const fieldOpsStaffFileSchema = z.object({
  version: z.literal(1).default(1),
  staff: z.array(fieldOpsStaffSchema).default([]),
});

export type FieldOpsStaffRow = z.output<typeof fieldOpsStaffSchema>;

const JOBS_REL = "data/field_ops/jobs.yaml";
const STAFF_REL = "data/field_ops/staff.yaml";

export function loadFieldOpsJobs(): {
  jobs: FieldOpsJob[];
  inputs_ref: string[];
} {
  const path = join(getDataDir(), "field_ops", "jobs.yaml");
  if (!existsSync(path)) return { jobs: [], inputs_ref: [] };
  try {
    const file = readYamlFile(path, fieldOpsJobsFileSchema);
    return {
      jobs: file.jobs,
      inputs_ref: file.jobs.length > 0 ? [JOBS_REL] : [],
    };
  } catch {
    return { jobs: [], inputs_ref: [] };
  }
}

export function loadFieldOpsStaff(): {
  staff: FieldOpsStaffRow[];
  inputs_ref: string[];
} {
  const path = join(getDataDir(), "field_ops", "staff.yaml");
  if (!existsSync(path)) return { staff: [], inputs_ref: [] };
  try {
    const file = readYamlFile(path, fieldOpsStaffFileSchema);
    return {
      staff: file.staff,
      inputs_ref: file.staff.length > 0 ? [STAFF_REL] : [],
    };
  } catch {
    return { staff: [], inputs_ref: [] };
  }
}
