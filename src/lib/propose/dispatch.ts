import { loadFieldOpsJobs, loadFieldOpsStaff } from "./field-ops-ledger.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

export type DispatchStaff = {
  id: string;
  skills: string[];
  free: boolean;
  waypoint?: string;
  /** Current assignment count — lower load ranks higher when scores tie. */
  load?: number;
};
export type DispatchJob = { id: string; skill: string; waypoint?: string };

function assertNoGpsTrace(staff: Array<DispatchStaff & Record<string, unknown>>): void {
  for (const person of staff) {
    if ("latitude" in person || "longitude" in person || "trace" in person) {
      throw new Error("gps trace is refused");
    }
  }
}

function rankStaff(job: DispatchJob, staff: DispatchStaff[], excludeStaffIds: string[]) {
  return staff
    .filter(
      (person) =>
        person.free && person.skills.includes(job.skill) && !excludeStaffIds.includes(person.id),
    )
    .map((person) => {
      const waypointMatch = Boolean(job.waypoint && person.waypoint === job.waypoint);
      const loadPenalty = person.load ?? 0;
      return {
        staffId: person.id,
        score: (waypointMatch ? 2 : 0) + 1 - Math.min(loadPenalty, 5) * 0.1,
        reason: waypointMatch ? "waypoint" : "skill",
        load: loadPenalty,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score || a.load - b.load || a.staffId.localeCompare(b.staffId),
    );
}

/** Build dispatch jobs from the field_ops job ledger (rows with skill). */
export function dispatchJobsFromLedger(): {
  jobs: DispatchJob[];
  inputs_ref: string[];
  missing_refs: string[];
} {
  const loaded = loadFieldOpsJobs();
  const jobs: DispatchJob[] = [];
  const missing_refs: string[] = [];
  for (const row of loaded.jobs) {
    if (!row.skill) {
      missing_refs.push(`job:${row.id}:skill`);
      continue;
    }
    jobs.push({ id: row.id, skill: row.skill, waypoint: row.waypoint });
  }
  if (loaded.inputs_ref.length === 0) missing_refs.push("field_ops/jobs.yaml");
  return { jobs, inputs_ref: loaded.inputs_ref, missing_refs };
}

/** Build dispatch staff from the field_ops staff ledger. */
export function dispatchStaffFromLedger(): {
  staff: DispatchStaff[];
  inputs_ref: string[];
  missing_refs: string[];
} {
  const loaded = loadFieldOpsStaff();
  const missing_refs: string[] = [];
  if (loaded.inputs_ref.length === 0) missing_refs.push("field_ops/staff.yaml");
  return {
    staff: loaded.staff.map((row) => ({
      id: row.id,
      skills: row.skills,
      free: row.free,
      waypoint: row.waypoint,
      load: row.load,
    })),
    inputs_ref: loaded.inputs_ref,
    missing_refs,
  };
}

export function resolveDispatchInputs(input?: {
  jobs?: DispatchJob[];
  staff?: DispatchStaff[];
}): {
  jobs: DispatchJob[];
  staff: DispatchStaff[];
  inputs_ref: string[];
  missing_refs: string[];
} {
  const inputs_ref: string[] = [];
  const missing_refs: string[] = [];
  let jobs = input?.jobs;
  let staff = input?.staff;
  if (!jobs) {
    const loaded = dispatchJobsFromLedger();
    jobs = loaded.jobs;
    inputs_ref.push(...loaded.inputs_ref);
    missing_refs.push(...loaded.missing_refs);
  }
  if (!staff) {
    const loaded = dispatchStaffFromLedger();
    staff = loaded.staff;
    inputs_ref.push(...loaded.inputs_ref);
    missing_refs.push(...loaded.missing_refs);
  }
  return { jobs, staff, inputs_ref, missing_refs };
}

export function proposeDispatch(
  jobs: DispatchJob[],
  staff: DispatchStaff[],
  excludeStaffIds: string[] = [],
): Array<{ jobId: string; staffId?: string; reason: string }> {
  assertNoGpsTrace(staff);
  return jobs.map((job) => {
    const ranked = rankStaff(job, staff, excludeStaffIds);
    const chosen = ranked[0];
    if (!chosen) return { jobId: job.id, reason: "no free staff with the skill" };
    return { jobId: job.id, staffId: chosen.staffId, reason: "proposal" };
  });
}

export function scoreDispatch(
  jobs: DispatchJob[],
  staff: DispatchStaff[],
): Array<{
  jobId: string;
  ranked: Array<{ staffId: string; score: number; reason: string; load: number }>;
}> {
  assertNoGpsTrace(staff);
  return jobs.map((job) => ({ jobId: job.id, ranked: rankStaff(job, staff, []) }));
}

/** One report. Skill, waypoint, and load — no GPS trace, no route optimize, no apply. */
export function renderDispatchReport(
  jobs?: DispatchJob[],
  staff?: DispatchStaff[],
  excludeStaffIds: string[] = [],
): Record<string, unknown> {
  const resolved = resolveDispatchInputs({ jobs, staff });
  return flattenProposeReport(
    makeProposeReport({
      kind: "dispatch-report",
      depth: resolved.inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref: resolved.inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        assignments: proposeDispatch(resolved.jobs, resolved.staff, excludeStaffIds),
        ranked: scoreDispatch(resolved.jobs, resolved.staff),
        missing_refs: resolved.missing_refs,
        gpsTrace: false,
        routeOptimized: false,
        applied: false,
      },
    }),
  );
}

/** Ranked reassignment. Does not apply the assignment. */
export function proposeReplan(
  jobs: DispatchJob[],
  staff: DispatchStaff[],
  excludeStaffIds: string[] = [],
): Array<{
  jobId: string;
  ranked: Array<{ staffId: string; score: number; reason: string; load: number }>;
  apply: "human";
  applied: false;
}> {
  assertNoGpsTrace(staff);
  return jobs.map((job) => ({
    jobId: job.id,
    ranked: rankStaff(job, staff, excludeStaffIds),
    apply: "human" as const,
    applied: false as const,
  }));
}

/** One report. Waypoint + load ranking — no GPS auto-reorder and no apply. */
export function renderReplanReport(
  jobs?: DispatchJob[],
  staff?: DispatchStaff[],
  excludeStaffIds: string[] = [],
): Record<string, unknown> {
  const resolved = resolveDispatchInputs({ jobs, staff });
  return flattenProposeReport(
    makeProposeReport({
      kind: "replan-report",
      depth: resolved.inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref: resolved.inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        plans: proposeReplan(resolved.jobs, resolved.staff, excludeStaffIds),
        missing_refs: resolved.missing_refs,
        gpsAutoReorder: false,
      },
    }),
  );
}
