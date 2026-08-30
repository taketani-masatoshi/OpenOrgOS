import { setTenantId } from "../lib/tenant.js";
import {
  assessAuditorEligibility,
  assessProgrammeCoverage,
  auditPlanProgress,
  concludeAuditPlan,
  createAuditPlan,
  findAuditPlan,
  formatAuditPlan,
  loadAuditPlans,
  setAuditFinding,
} from "../lib/iso-audit-plan.js";
import {
  applyPrecheckFindings,
  assessFollowUp,
  buildAuditBrief,
  formatFollowUp,
} from "../lib/iso-audit-precheck.js";
import { isoAuditVerdict } from "../../schemas/iso-audit-plan.js";

export interface IsoAuditPlanCliOptions {
  tenant?: string;
  json?: boolean;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export function runIsoAuditPlanCreate(
  options: IsoAuditPlanCliOptions & {
    iso?: string;
    framework?: string;
    auditor?: string;
    period?: string;
    scope?: string;
    criteria?: string;
    sampling?: string;
    precheckRunId?: string;
    operatorId?: string;
    force?: boolean;
  },
): void {
  if (options.tenant) setTenantId(options.tenant);
  const framework = options.framework === "financial" || options.framework === "jsox" ? options.framework : "iso";
  const standard = framework === "iso" ? options.iso : framework;
  if (!standard) fail(framework === "iso" ? "--iso が必要です。" : "--framework financial|jsox を指定してください。");
  if (!options.auditor) fail("--auditor <operator-id> が必要です。");
  if (!options.period) fail("--period YYYY-MM..YYYY-MM が必要です。");

  const [start, end] = options.period.split("..");
  if (!start || !end) fail("--period は YYYY-MM..YYYY-MM 形式です。");

  try {
    const plan = createAuditPlan({
      standard,
      framework,
      auditorOperatorId: options.auditor,
      periodStart: start,
      periodEnd: end,
      scopeControls: options.scope?.split(",").map((s) => s.trim()).filter(Boolean),
      criteria: options.criteria?.split(",").map((s) => s.trim()).filter(Boolean),
      sampling: options.sampling,
      precheckRunId: options.precheckRunId,
      createdBy: options.operatorId ?? options.auditor,
      overrideEligibility: options.force,
    });
    if (options.json) {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      console.log(`監査計画 ${plan.plan_id} を作成しました（${plan.standard}）。`);
      console.log(formatAuditPlan(plan));
    }
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

export function runIsoAuditPlanList(options: IsoAuditPlanCliOptions & { iso?: string }): void {
  if (options.tenant) setTenantId(options.tenant);
  const plans = loadAuditPlans().plans.filter((p) => !options.iso || p.standard === options.iso);
  if (options.json) {
    console.log(JSON.stringify(plans, null, 2));
    return;
  }
  if (plans.length === 0) {
    console.log("監査計画がありません。orgos iso audit plan create で作成してください。");
    return;
  }
  console.log("| 計画 | 規格 | 監査員 | 期間 | 状態 | 判定 |");
  console.log("|------|------|--------|------|------|------|");
  for (const plan of plans) {
    const progress = auditPlanProgress(plan);
    console.log(
      `| ${plan.plan_id} | ${plan.standard} | ${plan.auditor_operator_id} | ` +
        `${plan.period_start}〜${plan.period_end} | ${plan.status} | ${progress.judged}/${progress.total} |`,
    );
  }
}

export function runIsoAuditPlanShow(options: IsoAuditPlanCliOptions & { plan?: string }): void {
  if (options.tenant) setTenantId(options.tenant);
  if (!options.plan) fail("--plan <IAP-...> が必要です。");
  const plan = findAuditPlan(options.plan);
  if (!plan) fail(`監査計画 ${options.plan} がありません。`);
  console.log(options.json ? JSON.stringify(plan, null, 2) : formatAuditPlan(plan));
}

export function runIsoAuditFindingSet(
  options: IsoAuditPlanCliOptions & {
    plan?: string;
    req?: string;
    verdict?: string;
    evidence?: string[];
    sample?: string;
    note?: string;
    operatorId?: string;
  },
): void {
  if (options.tenant) setTenantId(options.tenant);
  if (!options.plan) fail("--plan が必要です。");
  if (!options.req) fail("--req <REQ-...> が必要です。");
  const verdict = isoAuditVerdict.safeParse(options.verdict);
  if (!verdict.success) {
    fail(`--verdict は ${isoAuditVerdict.options.join(" | ")} のいずれかです。`);
  }

  try {
    const finding = setAuditFinding({
      planId: options.plan,
      requirementId: options.req,
      verdict: verdict.data,
      evidence: options.evidence,
      sample: options.sample,
      note: options.note,
      recordedBy: options.operatorId ?? findAuditPlan(options.plan)?.auditor_operator_id ?? "unknown",
    });
    const progress = auditPlanProgress(findAuditPlan(options.plan)!);
    if (options.json) {
      console.log(JSON.stringify({ finding, progress }, null, 2));
    } else {
      console.log(`${options.req}: ${finding.verdict} を記録しました。`);
      console.log(`判定済み ${progress.judged} / ${progress.total} 件。`);
    }
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

export function runIsoAuditConclude(
  options: IsoAuditPlanCliOptions & { plan?: string; summary?: string; operatorId?: string },
): void {
  if (options.tenant) setTenantId(options.tenant);
  if (!options.plan) fail("--plan が必要です。");
  if (!options.summary) fail("--summary <監査結論> が必要です。");

  try {
    const plan = concludeAuditPlan(options.plan, {
      concludedBy: options.operatorId ?? findAuditPlan(options.plan)?.auditor_operator_id ?? "unknown",
      summary: options.summary,
    });
    if (options.json) {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      console.log(formatAuditPlan(plan));
      console.log("");
      console.log(
        `署名は orgos iso audit sign --plan ${plan.plan_id} --operator-id <承認者> で行います。`,
      );
    }
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

export function runIsoAuditEligibility(
  options: IsoAuditPlanCliOptions & { iso?: string; auditor?: string; scope?: string },
): void {
  if (options.tenant) setTenantId(options.tenant);
  if (!options.iso) fail("--iso が必要です。");
  if (!options.auditor) fail("--auditor <operator-id> が必要です。");

  const result = assessAuditorEligibility(
    options.auditor,
    options.iso,
    options.scope?.split(",").map((s) => s.trim()).filter(Boolean) ?? [],
  );
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`監査員 ${options.auditor} — ${result.eligible ? "適格" : "不適格"}`);
  if (result.conflicting_agents.length > 0) {
    console.log(`- 独立性: 担当 agent と監査範囲が重複 — ${result.conflicting_agents.join(", ")}`);
  }
  if (result.competence_issue) console.log(`- 力量: ${result.competence_issue}`);
}

export function runIsoAuditProgramme(
  options: IsoAuditPlanCliOptions & { iso?: string; framework?: string; months?: string; strict?: boolean },
): void {
  if (options.tenant) setTenantId(options.tenant);
  const standard =
    options.framework === "financial" || options.framework === "jsox" ? options.framework : options.iso;
  if (!standard) fail("--iso または --framework financial|jsox が必要です。");

  const months = Number(options.months ?? "12");
  if (!Number.isFinite(months) || months <= 0) fail("--months は正の数です。");
  const since = new Date(Date.now() - months * 30 * 86_400_000).toISOString();
  const coverage = assessProgrammeCoverage(standard, since);

  if (options.json) {
    console.log(JSON.stringify(coverage, null, 2));
  } else {
    console.log(`# 監査プログラムの被覆 — ${coverage.standard}（過去 ${months} か月）`);
    console.log("");
    console.log(
      `**要求事項:** ${coverage.rows.length} 件 · **期間内に監査された:** ` +
        `${coverage.rows.length - coverage.never_audited.length} 件`,
    );
    if (coverage.never_audited.length > 0) {
      console.log("");
      console.log("## 期間内に一度も監査されていない要求事項");
      console.log("");
      for (const id of coverage.never_audited) console.log(`- ${id}`);
    }
  }
  if (options.strict && coverage.never_audited.length > 0) process.exitCode = 1;
}

export function runIsoAuditApplyPrecheck(
  options: IsoAuditPlanCliOptions & { plan?: string; operatorId?: string },
): void {
  if (options.tenant) setTenantId(options.tenant);
  if (!options.plan) fail("--plan が必要です。");
  try {
    const recordedBy = options.operatorId ?? findAuditPlan(options.plan)?.auditor_operator_id ?? "unknown";
    const proposals = applyPrecheckFindings(options.plan, recordedBy);
    const applied = proposals.filter((p) => !p.skipped);
    const residual = proposals.filter((p) => p.skipped);
    if (options.json) {
      console.log(JSON.stringify({ applied, residual }, null, 2));
      return;
    }
    console.log(`事前検査を適用しました: 提案 ${applied.length} 件 · 人間残件 ${residual.length} 件`);
    for (const p of applied) console.log(`- ${p.requirement_id}: ${p.verdict} · ${p.sample}`);
    if (residual.length > 0) {
      console.log("人間が書く所見:");
      for (const p of residual) console.log(`- ${p.requirement_id}: ${p.reason}`);
    }
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

export function runIsoAuditBrief(
  options: IsoAuditPlanCliOptions & { plan?: string; req?: string },
): void {
  if (options.tenant) setTenantId(options.tenant);
  if (!options.plan) fail("--plan が必要です。");
  if (!options.req) fail("--req <REQ-...> が必要です。");
  try {
    const text = buildAuditBrief(options.plan, options.req);
    console.log(options.json ? JSON.stringify({ brief: text }, null, 2) : text);
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

export function runIsoAuditFollowUp(
  options: IsoAuditPlanCliOptions & { plan?: string },
): void {
  if (options.tenant) setTenantId(options.tenant);
  if (!options.plan) fail("--plan が必要です。");
  try {
    if (options.json) {
      console.log(JSON.stringify(assessFollowUp(options.plan), null, 2));
      return;
    }
    console.log(formatFollowUp(options.plan));
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

