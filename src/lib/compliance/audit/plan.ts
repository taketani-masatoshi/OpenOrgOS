import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  isoAuditPlanRegistrySchema,
  type IsoAuditFinding,
  type IsoAuditPlan,
  type IsoAuditPlanRegistry,
  type IsoAuditVerdict,
} from "../../../../schemas/iso-audit-plan.js";
import { assessRequirementCoverage, loadRequirements } from "../../iso-requirements.js";
import { findOperatorById } from "../../org/operators.js";
import { getClock } from "../../runtime-context.js";
import { resolveTenantPath } from "../../tenant.js";
import { readYamlFile, writeYamlFile } from "../../utils.js";
import { assessAuditorEligibility, describeEligibilityFailure } from "./eligibility.js";
import { resolveAuditFramework, type AuditFramework } from "./framework.js";

export const ISO_AUDIT_PLANS_REL = "data/compliance/iso-audit-plans.yaml";

export function auditPlansPath(): string {
  return resolveTenantPath(ISO_AUDIT_PLANS_REL);
}

export function loadAuditPlans(): IsoAuditPlanRegistry {
  const path = auditPlansPath();
  if (!existsSync(path)) return { plans: [] };
  return readYamlFile(path, isoAuditPlanRegistrySchema);
}

export function saveAuditPlans(registry: IsoAuditPlanRegistry): void {
  writeYamlFile(auditPlansPath(), { ...registry, as_of: getClock().nowIso() });
}

export function findAuditPlan(planId: string): IsoAuditPlan | undefined {
  return loadAuditPlans().plans.find((plan) => plan.plan_id === planId);
}

function nextPlanId(registry: IsoAuditPlanRegistry): string {
  const max = registry.plans.reduce(
    (current, plan) => Math.max(current, Number(plan.plan_id.slice(4))),
    0
  );
  return `IAP-${String(max + 1).padStart(3, "0")}`;
}

export function auditPlanDigest(plan: IsoAuditPlan): string {
  const material = {
    plan_id: plan.plan_id,
    standard: plan.standard,
    auditor: plan.auditor_operator_id,
    period: [plan.period_start, plan.period_end],
    conclusion: plan.conclusion ?? null,
    findings: [...plan.findings]
      .sort((left, right) => left.requirement_id.localeCompare(right.requirement_id))
      .map((finding) => [
        finding.requirement_id,
        finding.verdict,
        finding.evidence.join("|"),
        finding.sample ?? "",
        finding.note ?? "",
      ]),
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

export interface CreateAuditPlanOptions {
  standard: string;
  auditorOperatorId: string;
  periodStart: string;
  periodEnd: string;
  scopeControls?: string[];
  criteria?: string[];
  sampling?: string;
  precheckRunId?: string;
  createdBy: string;
  framework?: AuditFramework;
  overrideEligibility?: boolean;
}

function validateCreateAuditPlan(options: CreateAuditPlanOptions): void {
  const requirements = loadRequirements(options.standard);
  if (!requirements) {
    throw new Error(
      `${options.standard} に requirements.yaml がありません。要求事項を記入してから監査計画を作成してください。`
    );
  }
  if (requirements.requirements.length === 0) {
    throw new Error(
      `${options.standard} の要求事項レジスタが空です。判定すべき要求事項がありません。`
    );
  }
  if (options.periodStart > options.periodEnd) {
    throw new Error("対象期間の開始が終了より後になっています。");
  }

  const eligibility = assessAuditorEligibility(
    options.auditorOperatorId,
    options.standard,
    options.scopeControls ?? []
  );
  if (!eligibility.eligible && !options.overrideEligibility) {
    throw new Error(`監査員として適格ではありません — ${describeEligibilityFailure(eligibility)}`);
  }
}

function defaultCriteria(framework: AuditFramework, standard: string): string[] {
  if (framework === "financial") return ["会計方針 REG", "GL スキーマ"];
  if (framework === "jsox") return ["財務報告内部統制の評価項目", "会計方針 REG"];
  return [standard];
}

function assembleAuditPlan(
  options: CreateAuditPlanOptions,
  registry: IsoAuditPlanRegistry
): IsoAuditPlan {
  const framework = resolveAuditFramework(options.standard, options.framework);
  const operator = findOperatorById(options.auditorOperatorId);
  return {
    plan_id: nextPlanId(registry),
    standard: options.standard,
    framework,
    status: "draft",
    auditor_operator_id: options.auditorOperatorId,
    auditor_name: operator?.display_name,
    period_start: options.periodStart,
    period_end: options.periodEnd,
    scope_controls: options.scopeControls ?? [],
    criteria: options.criteria ?? defaultCriteria(framework, options.standard),
    sampling: options.sampling,
    precheck_run_id: options.precheckRunId,
    created_at: getClock().nowIso(),
    created_by: options.createdBy,
    findings: [],
  };
}

export function createAuditPlan(options: CreateAuditPlanOptions): IsoAuditPlan {
  validateCreateAuditPlan(options);
  const registry = loadAuditPlans();
  const plan = assembleAuditPlan(options, registry);
  registry.plans.push(plan);
  saveAuditPlans(registry);
  return plan;
}

export function mutatePlan(planId: string, mutate: (plan: IsoAuditPlan) => void): IsoAuditPlan {
  const registry = loadAuditPlans();
  const plan = registry.plans.find((candidate) => candidate.plan_id === planId);
  if (!plan) throw new Error(`監査計画 ${planId} がありません。`);
  mutate(plan);
  saveAuditPlans(registry);
  return plan;
}

export interface SetFindingOptions {
  planId: string;
  requirementId: string;
  verdict: IsoAuditVerdict;
  evidence?: string[];
  sample?: string;
  note?: string;
  recordedBy: string;
}

export function setAuditFinding(options: SetFindingOptions): IsoAuditFinding {
  const plan = findAuditPlan(options.planId);
  if (!plan) throw new Error(`監査計画 ${options.planId} がありません。`);
  if (plan.status === "signed") {
    throw new Error(`${options.planId} は署名済みです。所見を変更できません。`);
  }
  if (
    !loadRequirements(plan.standard)?.requirements.some((item) => item.id === options.requirementId)
  ) {
    throw new Error(`${plan.standard} に要求事項 ${options.requirementId} がありません。`);
  }
  if (options.verdict.startsWith("nonconform") && !options.note?.trim()) {
    throw new Error("不適合の判定には監査員の記述（--note）が必要です。");
  }
  if (!options.sample?.trim()) {
    throw new Error("サンプリングの記述（--sample）が必要です。適合でも何を何件見たか記録します。");
  }

  const finding: IsoAuditFinding = {
    requirement_id: options.requirementId,
    verdict: options.verdict,
    evidence: options.evidence ?? [],
    sample: options.sample,
    note: options.note,
    recorded_at: getClock().nowIso(),
    recorded_by: options.recordedBy,
  };
  mutatePlan(options.planId, (current) => {
    current.findings = [
      ...current.findings.filter((item) => item.requirement_id !== options.requirementId),
      finding,
    ];
    if (current.status === "concluded") {
      current.status = "draft";
      current.conclusion = undefined;
    }
  });
  return finding;
}

export interface AuditPlanProgress {
  total: number;
  judged: number;
  unjudged: string[];
  nonconformities: number;
  major: number;
}

export function auditPlanProgress(plan: IsoAuditPlan): AuditPlanProgress {
  const requirements = loadRequirements(plan.standard)?.requirements ?? [];
  const judged = new Map(plan.findings.map((finding) => [finding.requirement_id, finding.verdict]));
  const verdicts = [...judged.values()];
  return {
    total: requirements.length,
    judged: judged.size,
    unjudged: requirements.filter((item) => !judged.has(item.id)).map((item) => item.id),
    nonconformities: verdicts.filter((verdict) => verdict.startsWith("nonconform")).length,
    major: verdicts.filter((verdict) => verdict === "nonconform_major").length,
  };
}

export function concludeAuditPlan(
  planId: string,
  options: { concludedBy: string; summary: string }
): IsoAuditPlan {
  const plan = findAuditPlan(planId);
  if (!plan) throw new Error(`監査計画 ${planId} がありません。`);
  if (plan.status === "signed") throw new Error(`${planId} は署名済みです。`);
  const progress = auditPlanProgress(plan);
  if (progress.unjudged.length > 0) {
    const suffix = progress.unjudged.length > 5 ? " ほか" : "";
    throw new Error(
      `未判定の要求事項が ${progress.unjudged.length} 件あります: ${progress.unjudged.slice(0, 5).join(", ")}${suffix}`
    );
  }
  if (!options.summary.trim()) throw new Error("監査結論の記述（--summary）が必要です。");
  return mutatePlan(planId, (current) => {
    current.status = "concluded";
    current.conclusion = {
      concluded_at: getClock().nowIso(),
      concluded_by: options.concludedBy,
      summary: options.summary,
      nonconformities: progress.nonconformities,
      major: progress.major,
    };
  });
}

export function recordAuditSignoff(
  planId: string,
  signoff: { approvalId: string; operatorId: string }
): IsoAuditPlan {
  const plan = findAuditPlan(planId);
  if (!plan) throw new Error(`監査計画 ${planId} がありません。`);
  if (plan.status !== "concluded") {
    throw new Error(`${planId} は conclude されていません。署名できません。`);
  }
  if (plan.auditor_operator_id === signoff.operatorId) {
    throw new Error("監査員が自らの監査結論に署名することはできません。");
  }
  return mutatePlan(planId, (current) => {
    current.status = "signed";
    current.signoff = {
      approval_id: signoff.approvalId,
      signed_at: getClock().nowIso(),
      signed_by_operator_id: signoff.operatorId,
      subject_digest: auditPlanDigest(current),
    };
  });
}

export function auditSignoffValid(plan: IsoAuditPlan): boolean {
  return Boolean(plan.signoff && plan.signoff.subject_digest === auditPlanDigest(plan));
}

export interface ProgrammeRow {
  requirement_id: string;
  clause: string;
  last_plan_id?: string;
  last_verdict?: IsoAuditVerdict;
  last_audited_at?: string;
}

export interface ProgrammeCoverage {
  standard: string;
  since: string;
  rows: ProgrammeRow[];
  never_audited: string[];
}

export function assessProgrammeCoverage(standard: string, sinceIso: string): ProgrammeCoverage {
  const coverage = assessRequirementCoverage(standard);
  const plans = loadAuditPlans().plans.filter(
    (plan) => plan.standard === standard && plan.status !== "draft"
  );
  const rows = coverage.requirements.map((requirement): ProgrammeRow => {
    const judged = plans
      .flatMap((plan) =>
        plan.findings
          .filter((finding) => finding.requirement_id === requirement.id)
          .map((finding) => ({ plan, finding }))
      )
      .filter(({ finding }) => finding.recorded_at >= sinceIso)
      .sort((left, right) => left.finding.recorded_at.localeCompare(right.finding.recorded_at));
    const latest = judged.at(-1);
    return {
      requirement_id: requirement.id,
      clause: requirement.clause,
      last_plan_id: latest?.plan.plan_id,
      last_verdict: latest?.finding.verdict,
      last_audited_at: latest?.finding.recorded_at,
    };
  });
  return {
    standard,
    since: sinceIso,
    rows,
    never_audited: rows.filter((row) => !row.last_audited_at).map((row) => row.requirement_id),
  };
}
