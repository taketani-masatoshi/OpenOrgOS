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
  jobs: DispatchJob[],
  staff: DispatchStaff[],
  excludeStaffIds: string[] = [],
): Record<string, unknown> {
  return flattenProposeReport(
    makeProposeReport({
      kind: "dispatch-report",
      depth: "L1",
      human_gate: { apply: "human" },
      payload: {
        assignments: proposeDispatch(jobs, staff, excludeStaffIds),
        ranked: scoreDispatch(jobs, staff),
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
  jobs: DispatchJob[],
  staff: DispatchStaff[],
  excludeStaffIds: string[] = [],
): Record<string, unknown> {
  return flattenProposeReport(
    makeProposeReport({
      kind: "replan-report",
      depth: "L1",
      human_gate: { apply: "human" },
      payload: {
        plans: proposeReplan(jobs, staff, excludeStaffIds),
        gpsAutoReorder: false,
      },
    }),
  );
}
