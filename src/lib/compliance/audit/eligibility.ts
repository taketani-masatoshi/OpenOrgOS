import { loadControlMaps } from "../../control-framework.js";
import { loadCompetence } from "../../data.js";
import { findOperatorById } from "../../org/operators.js";

/** Competence an internal auditor must hold before a plan may be created. */
export const AUDITOR_COMPETENCE_ID = "CMP-10";

const AUDIT_FUNCTION_AGENT = "internal_audit";

export interface AuditorEligibility {
  eligible: boolean;
  conflicting_agents: string[];
  competence_issue?: string;
}

export function assessAuditorEligibility(
  operatorId: string,
  standard: string,
  scopeControls: string[]
): AuditorEligibility {
  const operator = findOperatorById(operatorId);
  if (!operator) {
    return {
      eligible: false,
      conflicting_agents: [],
      competence_issue: `operator ${operatorId} が登録されていません`,
    };
  }

  const controls = loadControlMaps([standard]).filter(
    (control) => scopeControls.length === 0 || scopeControls.includes(control.id)
  );
  const owners = new Set<string>(
    controls.flatMap((control) => [control.primary_agent, ...(control.secondary_agents ?? [])])
  );
  const conflictingAgents = (operator.allowed_agents ?? [])
    .filter((agent) => owners.has(agent) && agent !== AUDIT_FUNCTION_AGENT)
    .sort();

  let competenceIssue: string | undefined;
  try {
    const competence = loadCompetence();
    const assessed = competence.assessments.some(
      (assessment) =>
        assessment.competence_id === AUDITOR_COMPETENCE_ID &&
        (!operator.person_id || assessment.employee_id === operator.person_id)
    );
    if (!competence.competences.some((item) => item.id === AUDITOR_COMPETENCE_ID)) {
      competenceIssue = `力量マップに ${AUDITOR_COMPETENCE_ID}（内部監査員）が定義されていません`;
    } else if (!assessed) {
      competenceIssue = `${AUDITOR_COMPETENCE_ID}（内部監査員）の力量評価がありません`;
    }
  } catch {
    competenceIssue = "力量マップ（data/hr/competence.yaml）を読めません";
  }

  return {
    eligible: conflictingAgents.length === 0 && competenceIssue === undefined,
    conflicting_agents: conflictingAgents,
    competence_issue: competenceIssue,
  };
}

export function describeEligibilityFailure(eligibility: AuditorEligibility): string {
  const reasons = [
    eligibility.conflicting_agents.length > 0
      ? `監査員が担当する agent と監査範囲が重複します: ${eligibility.conflicting_agents.join(", ")}`
      : undefined,
    eligibility.competence_issue,
  ].filter((reason): reason is string => Boolean(reason));
  return reasons.join(" · ");
}
