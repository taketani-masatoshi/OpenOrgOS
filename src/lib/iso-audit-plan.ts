import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  isoAuditPlanRegistrySchema,
  type IsoAuditFinding,
  type IsoAuditPlan,
  type IsoAuditPlanRegistry,
  type IsoAuditVerdict,
} from "../../schemas/iso-audit-plan.js";
import { loadControlMaps } from "./control-framework.js";
import { loadCompetence } from "./data.js";
import { assessRequirementCoverage, loadRequirements } from "./iso-requirements.js";
import { findOperatorById } from "./org/operators.js";
import { getClock } from "./runtime-context.js";
import { resolveTenantPath } from "./tenant.js";
import { readYamlFile, writeYamlFile } from "./utils.js";

export const ISO_AUDIT_PLANS_REL = "data/compliance/iso-audit-plans.yaml";

/** Competence an internal auditor must hold before a plan may be created. */
export const AUDITOR_COMPETENCE_ID = "CMP-10";

/**
 * The audit function itself is exempt from the independence check: every ISO
 * pack carries an internal-audit control owned by this agent, so counting it as
 * a conflict would leave no eligible auditor. Whether the audit programme is
 * run properly is therefore left to management review and external audit — this
 * check does not cover it.
 */
const AUDIT_FUNCTION_AGENT = "internal_audit";

export function auditPlansPath(): string {
  return resolveTenantPath(ISO_AUDIT_PLANS_REL);
}

export function loadAuditPlans(): IsoAuditPlanRegistry {
  const path = auditPlansPath();
  if (!existsSync(path)) return { plans: [] };
  return readYamlFile(path, isoAuditPlanRegistrySchema);
}

export function saveAuditPlans(registry: IsoAuditPlanRegistry): void {
  writeYamlFile(auditPlansPath(), {
    ...registry,
    as_of: getClock().nowIso(),
  });
}

export function findAuditPlan(planId: string): IsoAuditPlan | undefined {
  return loadAuditPlans().plans.find((p) => p.plan_id === planId);
}

function nextPlanId(registry: IsoAuditPlanRegistry): string {
  const max = registry.plans.reduce((n, p) => Math.max(n, Number(p.plan_id.slice(4))), 0);
  return `IAP-${String(max + 1).padStart(3, "0")}`;
}

/**
 * Digest of the judgements, used as the approval subject.
 *
 * Signing binds the auditor to what was actually concluded. Editing a finding
 * after sign-off changes the digest, so the recorded approval no longer
 * verifies — the same property `assertHumanApprovalContext` relies on.
 */
export function auditPlanDigest(plan: IsoAuditPlan): string {
  const material = {
    plan_id: plan.plan_id,
    standard: plan.standard,
    auditor: plan.auditor_operator_id,
    period: [plan.period_start, plan.period_end],
    conclusion: plan.conclusion ?? null,
    findings: [...plan.findings]
      .sort((a, b) => a.requirement_id.localeCompare(b.requirement_id))
      .map((f) => [f.requirement_id, f.verdict, f.evidence.join("|"), f.sample ?? "", f.note ?? ""]),
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

export interface AuditorEligibility {
  eligible: boolean;
  /** Agents the auditor may operate that also own a control under audit. */
  conflicting_agents: string[];
  /** Reason the auditor's competence is not established, if any. */
  competence_issue?: string;
}

/**
 * ISO 19011 asks auditors not to audit their own work. Here that is checkable:
 * an operator's `allowed_agents` are the areas they act in, and a control names
 * the agent that owns it. An overlap means the auditor would be judging work
 * they are authorised to perform.
 */
export function assessAuditorEligibility(
  operatorId: string,
  standard: string,
  scopeControls: string[],
): AuditorEligibility {
  const operator = findOperatorById(operatorId);
  if (!operator) {
    return { eligible: false, conflicting_agents: [], competence_issue: `operator ${operatorId} が登録されていません` };
  }

  // Judged against the pack's controls rather than what is currently in scope:
  // a control excluded today can come into scope during the audit period, and
  // erring towards refusing an auditor is the safe direction.
  const controls = loadControlMaps([standard]).filter(
    (c) => scopeControls.length === 0 || scopeControls.includes(c.id),
  );
  const owners = new Set<string>();
  for (const c of controls) {
    owners.add(c.primary_agent);
    for (const a of c.secondary_agents ?? []) owners.add(a);
  }
  const allowed = operator.allowed_agents ?? [];
  const conflicting = allowed
    .filter((a) => owners.has(a) && a !== AUDIT_FUNCTION_AGENT)
    .sort();

  let competence_issue: string | undefined;
  try {
    const competence = loadCompetence();
    const employeeIds = operator.person_id ? [operator.person_id] : [];
    const assessed = competence.assessments.some(
      (a) =>
        a.competence_id === AUDITOR_COMPETENCE_ID &&
        (employeeIds.length === 0 || employeeIds.includes(a.employee_id)),
    );
    if (!competence.competences.some((c) => c.id === AUDITOR_COMPETENCE_ID)) {
      competence_issue = `力量マップに ${AUDITOR_COMPETENCE_ID}（内部監査員）が定義されていません`;
    } else if (!assessed) {
      competence_issue = `${AUDITOR_COMPETENCE_ID}（内部監査員）の力量評価がありません`;
    }
  } catch {
    competence_issue = "力量マップ（data/hr/competence.yaml）を読めません";
  }

  return {
    eligible: conflicting.length === 0 && competence_issue === undefined,
    conflicting_agents: conflicting,
    competence_issue,
  };
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
  framework?: "iso" | "financial" | "jsox";
  /** Record the plan despite an eligibility failure — recorded, never silent. */
  overrideEligibility?: boolean;
}

export function createAuditPlan(options: CreateAuditPlanOptions): IsoAuditPlan {
  const requirements = loadRequirements(options.standard);
  if (!requirements) {
    throw new Error(
      `${options.standard} に requirements.yaml がありません。要求事項を記入してから監査計画を作成してください。`,
    );
  }
  if (requirements.requirements.length === 0) {
    throw new Error(
      `${options.standard} の要求事項レジスタが空です。判定すべき要求事項がありません。`,
    );
  }
  if (options.periodStart > options.periodEnd) {
    throw new Error("対象期間の開始が終了より後になっています。");
  }

  const eligibility = assessAuditorEligibility(
    options.auditorOperatorId,
    options.standard,
    options.scopeControls ?? [],
  );
  if (!eligibility.eligible && !options.overrideEligibility) {
    const reasons = [
      eligibility.conflicting_agents.length > 0
        ? `監査員が担当する agent と監査範囲が重複します: ${eligibility.conflicting_agents.join(", ")}`
        : undefined,
      eligibility.competence_issue,
    ].filter(Boolean);
    throw new Error(`監査員として適格ではありません — ${reasons.join(" · ")}`);
  }

  const registry = loadAuditPlans();
  const operator = findOperatorById(options.auditorOperatorId);
  const framework =
    options.framework ??
    (options.standard === "financial" || options.standard === "jsox" ? options.standard : "iso");
  const defaultCriteria =
    framework === "financial"
      ? ["会計方針 REG", "GL スキーマ"]
      : framework === "jsox"
        ? ["財務報告内部統制の評価項目", "会計方針 REG"]
        : [options.standard];
  const plan: IsoAuditPlan = {
    plan_id: nextPlanId(registry),
    standard: options.standard,
    framework,
    status: "draft",
    auditor_operator_id: options.auditorOperatorId,
    auditor_name: operator?.display_name,
    period_start: options.periodStart,
    period_end: options.periodEnd,
    scope_controls: options.scopeControls ?? [],
    criteria: options.criteria ?? defaultCriteria,
    sampling: options.sampling,
    precheck_run_id: options.precheckRunId,
    created_at: getClock().nowIso(),
    created_by: options.createdBy,
    findings: [],
  };
  registry.plans.push(plan);
  saveAuditPlans(registry);
  return plan;
}

function mutatePlan(planId: string, mutate: (plan: IsoAuditPlan) => void): IsoAuditPlan {
  const registry = loadAuditPlans();
  const plan = registry.plans.find((p) => p.plan_id === planId);
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
  const requirements = loadRequirements(plan.standard);
  if (!requirements?.requirements.some((r) => r.id === options.requirementId)) {
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
  mutatePlan(options.planId, (p) => {
    p.findings = [...p.findings.filter((f) => f.requirement_id !== options.requirementId), finding];
    // Re-opening a concluded plan invalidates the conclusion it was based on.
    if (p.status === "concluded") {
      p.status = "draft";
      p.conclusion = undefined;
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
  const judged = new Map(plan.findings.map((f) => [f.requirement_id, f.verdict]));
  const unjudged = requirements.filter((r) => !judged.has(r.id)).map((r) => r.id);
  const verdicts = [...judged.values()];
  return {
    total: requirements.length,
    judged: judged.size,
    unjudged,
    nonconformities: verdicts.filter((v) => v.startsWith("nonconform")).length,
    major: verdicts.filter((v) => v === "nonconform_major").length,
  };
}

/**
 * Close an audit. Refuses while any requirement is unjudged: a conclusion drawn
 * over requirements nobody looked at is the failure this whole layer exists to
 * prevent.
 */
export function concludeAuditPlan(
  planId: string,
  options: { concludedBy: string; summary: string },
): IsoAuditPlan {
  const plan = findAuditPlan(planId);
  if (!plan) throw new Error(`監査計画 ${planId} がありません。`);
  if (plan.status === "signed") throw new Error(`${planId} は署名済みです。`);
  const progress = auditPlanProgress(plan);
  if (progress.unjudged.length > 0) {
    throw new Error(
      `未判定の要求事項が ${progress.unjudged.length} 件あります: ` +
        `${progress.unjudged.slice(0, 5).join(", ")}${progress.unjudged.length > 5 ? " ほか" : ""}`,
    );
  }
  if (!options.summary.trim()) throw new Error("監査結論の記述（--summary）が必要です。");

  return mutatePlan(planId, (p) => {
    p.status = "concluded";
    p.conclusion = {
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
  signoff: { approvalId: string; operatorId: string },
): IsoAuditPlan {
  const plan = findAuditPlan(planId);
  if (!plan) throw new Error(`監査計画 ${planId} がありません。`);
  if (plan.status !== "concluded") {
    throw new Error(`${planId} は conclude されていません。署名できません。`);
  }
  if (plan.auditor_operator_id === signoff.operatorId) {
    throw new Error("監査員が自らの監査結論に署名することはできません。");
  }
  return mutatePlan(planId, (p) => {
    p.status = "signed";
    p.signoff = {
      approval_id: signoff.approvalId,
      signed_at: getClock().nowIso(),
      signed_by_operator_id: signoff.operatorId,
      subject_digest: auditPlanDigest(p),
    };
  });
}

/** A signed plan whose findings were edited afterwards no longer verifies. */
export function auditSignoffValid(plan: IsoAuditPlan): boolean {
  if (!plan.signoff) return false;
  return plan.signoff.subject_digest === auditPlanDigest(plan);
}

export interface ProgrammeRow {
  requirement_id: string;
  clause: string;
  /** Most recent plan that judged it inside the window. */
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

/**
 * Whether the audit programme has been round the requirements at all within the
 * window. A single audit that keeps revisiting the same clauses satisfies "we
 * audit regularly" while leaving parts of the system never examined.
 */
export function assessProgrammeCoverage(standard: string, sinceIso: string): ProgrammeCoverage {
  const coverage = assessRequirementCoverage(standard);
  const plans = loadAuditPlans().plans.filter(
    (p) => p.standard === standard && p.status !== "draft",
  );

  const rows: ProgrammeRow[] = coverage.requirements.map((req) => {
    const judged = plans
      .flatMap((p) => p.findings.filter((f) => f.requirement_id === req.id).map((f) => ({ p, f })))
      .filter(({ f }) => f.recorded_at >= sinceIso)
      .sort((a, b) => a.f.recorded_at.localeCompare(b.f.recorded_at));
    const latest = judged.at(-1);
    return {
      requirement_id: req.id,
      clause: req.clause,
      last_plan_id: latest?.p.plan_id,
      last_verdict: latest?.f.verdict,
      last_audited_at: latest?.f.recorded_at,
    };
  });

  return {
    standard,
    since: sinceIso,
    rows,
    never_audited: rows.filter((r) => !r.last_audited_at).map((r) => r.requirement_id),
  };
}

const VERDICT_LABELS: Record<IsoAuditVerdict, string> = {
  conform: "適合",
  nonconform_minor: "軽微な不適合",
  nonconform_major: "重大な不適合",
  observation: "観察事項",
  not_applicable: "適用外",
};

export function formatAuditPlan(plan: IsoAuditPlan): string {
  const progress = auditPlanProgress(plan);
  const requirements = loadRequirements(plan.standard)?.requirements ?? [];
  const byId = new Map(requirements.map((r) => [r.id, r]));

  const lines = [
    `# 内部監査計画 ${plan.plan_id} — ${plan.standard}`,
    "",
    `**監査員:** ${plan.auditor_name ?? plan.auditor_operator_id}（${plan.auditor_operator_id}）`,
    `**対象期間:** ${plan.period_start} 〜 ${plan.period_end}`,
    `**状態:** ${plan.status}`,
    `**判定:** ${progress.judged} / ${progress.total} 件`,
    "",
  ];
  if (plan.sampling) lines.push(`**サンプリング方針:** ${plan.sampling}`, "");
  if (plan.criteria.length > 0) lines.push(`**監査基準:** ${plan.criteria.join(" · ")}`, "");
  if (plan.precheck_run_id) {
    lines.push(`**事前検査:** ${plan.precheck_run_id}（orgos iso audit run の結果）`, "");
  }

  lines.push("## 所見", "", "| 要求事項 | 箇条 | 判定 | 根拠 | 記述 |", "|---|---|---|---|---|");
  for (const req of requirements) {
    const finding = plan.findings.find((f) => f.requirement_id === req.id);
    lines.push(
      `| ${req.id} | ${req.clause} | ${finding ? VERDICT_LABELS[finding.verdict] : "未判定"} | ` +
        `${finding?.evidence.join("<br>") ?? "—"} | ${finding?.note ?? "—"} |`,
    );
  }

  if (plan.conclusion) {
    lines.push(
      "",
      "## 結論",
      "",
      plan.conclusion.summary,
      "",
      `**不適合:** ${plan.conclusion.nonconformities} 件（うち重大 ${plan.conclusion.major} 件）`,
      `**結論日時:** ${plan.conclusion.concluded_at} · ${plan.conclusion.concluded_by}`,
    );
  }
  if (plan.signoff) {
    lines.push(
      "",
      "## 署名",
      "",
      `**承認:** ${plan.signoff.approval_id} · ${plan.signoff.signed_by_operator_id} · ${plan.signoff.signed_at}`,
      auditSignoffValid(plan)
        ? "**検証:** 署名後に所見は変更されていません。"
        : "**検証:** ✗ 署名後に所見が変更されています。再監査・再署名が必要です。",
    );
  }
  // Silence about the caveat would let a signed report read as conformance to
  // the standard rather than to our paraphrase of it.
  if (byId.size > 0 && [...byId.values()].every((r) => !r.verified_on)) {
    lines.push(
      "",
      "要求事項の文言は規格票の転記ではなく言い換えである（`orgos iso requirements --unverified`）。",
    );
  }
  return lines.join("\n");
}
