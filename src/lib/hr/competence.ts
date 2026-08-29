import type {
  CompetenceFile,
  CompetenceLevel,
  TrainingFile,
} from "../../../schemas/hr.js";
import { loadCompetence, loadEmployees, loadTraining } from "../data.js";

export const COMPETENCE_LEVEL_LABELS: Record<CompetenceLevel, string> = {
  0: "未習得",
  1: "知識あり（補助が要る）",
  2: "単独で遂行できる",
  3: "指導・改善ができる",
};

export interface CompetenceCell {
  employee_id: string;
  employee_name: string;
  role_id: string;
  competence_id: string;
  competence_title: string;
  statutory: boolean;
  required: CompetenceLevel;
  current: CompetenceLevel;
  /** Positive when the person falls short of the required level. */
  gap: number;
  basis?: string;
  assessed_on?: string;
}

export interface CompetenceMatrix {
  as_of: string;
  standard?: string;
  cells: CompetenceCell[];
  /** Cells whose required level is not met, worst first. */
  gaps: CompetenceCell[];
  /** Referential problems that make the map untrustworthy. */
  issues: string[];
}

/**
 * Builds the competence matrix. Every person-competence pair required by the
 * person's role produces a cell, including pairs with no assessment on file —
 * a missing assessment is a gap, not an absence of one.
 */
export function buildCompetenceMatrix(
  file: CompetenceFile = loadCompetence(),
): CompetenceMatrix {
  const employees = new Map(loadEmployees().employees.map((e) => [e.id, e]));
  const issues: string[] = [];
  const cells: CompetenceCell[] = [];

  const roleOf = new Map<string, string>();
  for (const role of file.roles) {
    for (const member of role.members) {
      if (!employees.has(member)) {
        issues.push(`${role.id} references unknown employee ${member}`);
        continue;
      }
      const existing = roleOf.get(member);
      if (existing) {
        issues.push(`${member} belongs to both ${existing} and ${role.id}`);
        continue;
      }
      roleOf.set(member, role.id);
    }
  }

  const knownCompetences = new Set(file.competences.map((c) => c.id));
  const assessed = new Map<string, (typeof file.assessments)[number]>();
  for (const a of file.assessments) {
    if (!knownCompetences.has(a.competence_id)) {
      issues.push(`assessment references unknown competence ${a.competence_id}`);
      continue;
    }
    if (!employees.has(a.employee_id)) {
      issues.push(`assessment references unknown employee ${a.employee_id}`);
      continue;
    }
    assessed.set(`${a.employee_id}/${a.competence_id}`, a);
  }

  const roleIds = new Set(file.roles.map((r) => r.id));
  for (const comp of file.competences) {
    for (const roleId of Object.keys(comp.required)) {
      if (!roleIds.has(roleId)) {
        issues.push(`${comp.id} requires unknown role ${roleId}`);
      }
    }
  }

  for (const role of file.roles) {
    for (const member of role.members) {
      if (roleOf.get(member) !== role.id) continue;
      const employee = employees.get(member);
      if (!employee) continue;
      for (const comp of file.competences) {
        const required = comp.required[role.id];
        if (required === undefined) continue;
        const a = assessed.get(`${member}/${comp.id}`);
        const current = (a?.level ?? 0) as CompetenceLevel;
        cells.push({
          employee_id: member,
          employee_name: employee.name,
          role_id: role.id,
          competence_id: comp.id,
          competence_title: comp.title,
          statutory: comp.statutory,
          required,
          current,
          gap: Math.max(0, required - current),
          basis: a?.basis,
          assessed_on: a?.assessed_on,
        });
        if (!a) {
          issues.push(`${member} has no assessment for ${comp.id}`);
        }
      }
    }
  }

  const gaps = cells
    .filter((c) => c.gap > 0)
    .sort(
      (a, b) =>
        b.gap - a.gap ||
        Number(b.statutory) - Number(a.statutory) ||
        a.competence_id.localeCompare(b.competence_id),
    );

  return { as_of: file.as_of, standard: file.standard, cells, gaps, issues };
}

export interface TrainingCoverage {
  /** Gap cells with no planned session covering the competence. */
  uncovered: CompetenceCell[];
  /** Sessions whose audience does not include everyone with the gap. */
  audience_gaps: { session_id: string; missing: string[] }[];
  /** Records that did not reach the intended effect. */
  follow_up: { session_id: string; employee_id: string; result: string }[];
  issues: string[];
}

/**
 * Checks the plan against the map: every gap should have a session, every
 * session should reach the people who have the gap, and partial results should
 * remain visible until re-assessed.
 */
export function assessTrainingCoverage(
  matrix: CompetenceMatrix = buildCompetenceMatrix(),
  training: TrainingFile = loadTraining(),
): TrainingCoverage {
  const issues: string[] = [];
  const sessionIds = new Set(training.sessions.map((s) => s.id));
  for (const r of training.records) {
    if (!sessionIds.has(r.session_id)) {
      issues.push(`record references unknown session ${r.session_id}`);
    }
  }

  const plannedFor = new Map<string, Set<string>>();
  for (const s of training.sessions) {
    for (const cid of s.competence_ids) {
      const set = plannedFor.get(cid) ?? new Set<string>();
      for (const emp of s.audience) set.add(emp);
      plannedFor.set(cid, set);
    }
  }

  const uncovered = matrix.gaps.filter(
    (g) => !plannedFor.get(g.competence_id)?.has(g.employee_id),
  );

  const audience_gaps: TrainingCoverage["audience_gaps"] = [];
  for (const s of training.sessions) {
    const missing = new Set<string>();
    for (const cid of s.competence_ids) {
      for (const g of matrix.gaps) {
        if (g.competence_id === cid && !s.audience.includes(g.employee_id)) {
          missing.add(g.employee_id);
        }
      }
    }
    if (missing.size > 0) {
      audience_gaps.push({ session_id: s.id, missing: [...missing].sort() });
    }
  }

  const follow_up = training.records
    .filter((r) => r.result !== "effective")
    .map((r) => ({
      session_id: r.session_id,
      employee_id: r.employee_id,
      result: r.result,
    }));

  return { uncovered, audience_gaps, follow_up, issues };
}
