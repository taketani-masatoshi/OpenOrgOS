import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadAllData, loadYojitsuFyPlan, validateAll, loadCashBalance } from "./data.js";
import { listEffectiveRegulations } from "./regulations.js";
import { runIntegrityChecks, summarizeIntegrity } from "./integrity.js";
import { scanContractAlerts } from "./alerts.js";
import { getDataDir, resolveTenantPath } from "./utils.js";
import {
  getFiscalYearRange,
  getP0Contracts,
  getP0Records,
  getP0Audits,
  listOperationsModules,
  resolveModuleSecretsPath,
  resolveRecordsProbePath,
  resolveTenantDocPath,
  isSkeletonTenant,
} from "./ops-config.js";

export interface MaturityDimension {
  id: "preparedness" | "operational" | "automation";
  label: string;
  score: number;
  max: number;
  pct: number | null;
  detail: string;
  na?: boolean;
}

export interface MaturityReport {
  preparedness: MaturityDimension;
  operational: MaturityDimension;
  automation: MaturityDimension;
  overall: number;
  grade: string;
  recommendations: string[];
}

function gradeFromScore(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function dim(
  id: MaturityDimension["id"],
  label: string,
  score: number,
  max: number,
  detail: string,
  na = false
): MaturityDimension {
  return {
    id,
    label,
    score,
    max,
    pct: na ? null : max ? Math.round((score / max) * 100) : 0,
    detail,
    na,
  };
}

/** 準備度 / 運用度 / 自動化度 — steward status と assessment の共通定義 */
export function computeMaturityReport(): MaturityReport {
  const recommendations: string[] = [];
  const skeleton = isSkeletonTenant();
  const validation = validateAll();
  const integrity = summarizeIntegrity(runIntegrityChecks());
  const data = loadAllData();
  const fy = getFiscalYearRange();
  const p0ContractIds = new Set(getP0Contracts().map((c) => c.id));

  let prep = 0;
  prep += validation.ok ? 25 : 0;
  prep += Math.max(0, 20 - integrity.errors * 5 - integrity.warnings);
  const effectiveRegs = listEffectiveRegulations().filter((r) => r.effective);
  prep += effectiveRegs.length >= 10 ? 15 : Math.round((effectiveRegs.length / 10) * 15);
  const yojitsu = loadYojitsuFyPlan(fy.id);
  prep += yojitsu?.months.length === 12 && yojitsu.summary ? 15 : yojitsu ? 8 : 0;
  prep += data.contracts.length ? 15 : 0;
  const planPath = fy.planFile
    ? resolveTenantPath(fy.planFile)
    : join(getDataDir(), "plans", `yojitsu-${fy.id.toLowerCase()}.yaml`);
  prep += existsSync(planPath) ? 10 : 0;
  if (!validation.ok) recommendations.push("npm run validate でスキーマエラーを解消");
  const prepDim = dim(
    "preparedness",
    "準備度",
    Math.min(100, prep),
    100,
    validation.ok
      ? `REG 有効 ${effectiveRegs.length} · 予実 ${yojitsu?.months.length ?? 0}/12`
      : `検証エラー ${validation.errors.length} 件`
  );

  let ops = 0;
  let opsDim: MaturityDimension;
  if (skeleton) {
    opsDim = dim("operational", "運用度", 0, 100, "スケルトンモード — 運用評価対象外", true);
  } else {
    const executed = data.contracts.filter((c) => c.status === "executed");
    ops += Math.round((executed.length / Math.max(data.contracts.length, 1)) * 20);
    const draftP0 = data.contracts.filter((c) => c.status === "draft" && p0ContractIds.has(c.id));
    if (draftP0.length) {
      recommendations.push(`P0 契約: ${draftP0.map((c) => c.id).join(", ")} を executed 化`);
    }
    const fyFinance = data.monthlyFinances.filter((m) => m.month >= fy.from && m.month <= fy.to);
    ops += Math.round((fyFinance.length / 12) * 25);

    const recordProbes = getP0Records();
    const hasRecords = recordProbes.some((spec) => {
      const p = resolveRecordsProbePath(spec.module_id, spec.probe_file);
      return p ? existsSync(p) : false;
    });
    ops += hasRecords ? 20 : 0;
    if (recordProbes.length && !hasRecords) {
      recommendations.push("operations/records に運用記録を開始");
    }

    const cash = loadCashBalance();
    if (cash?.status === "confirmed") {
      ops += 15;
    } else {
      ops += cash ? 5 : 0;
      recommendations.push("cash-balance.yaml を confirmed に更新");
    }

    const opsModules = listOperationsModules();
    for (const mod of opsModules) {
      if (!mod.operationsSecrets) continue;
      const secretsPath = resolveModuleSecretsPath(mod.moduleId);
      if (secretsPath && existsSync(secretsPath)) {
        ops += 20;
      } else if (!skeleton) {
        recommendations.push(`${mod.operationsSecrets} を example から作成`);
      }
    }

    const audits = getP0Audits();
    if (audits.some((audit) => existsSync(resolveTenantDocPath(audit.path)))) {
      ops += 20;
    }

    opsDim = dim(
      "operational",
      "運用度",
      Math.min(100, ops),
      100,
      `${executed.length}/${data.contracts.length} executed · 月次 ${fyFinance.length}/12 · records ${hasRecords ? "開始" : "未"}`
    );
  }

  let auto = 0;
  auto += validation.ok ? 30 : 0;
  auto += integrity.errors === 0 ? 25 : 0;
  auto += existsSync(join(getDataDir(), "document-io.yaml")) ? 15 : 0;
  auto += existsSync(join(getDataDir(), "classification-registry.yaml")) ? 15 : 0;
  auto += scanContractAlerts(data.contracts, 90).length >= 0 ? 15 : 0;
  auto += 15;
  const autoDim = dim(
    "automation",
    "自動化度",
    Math.min(100, auto),
    100,
    "validate · classification · daily · deps"
  );

  const overall = skeleton
    ? Math.round(((prepDim.pct ?? 0) + (autoDim.pct ?? 0)) / 2)
    : Math.round(((prepDim.pct ?? 0) + (opsDim.pct ?? 0) + (autoDim.pct ?? 0)) / 3);

  return {
    preparedness: prepDim,
    operational: opsDim,
    automation: autoDim,
    overall,
    grade: gradeFromScore(overall),
    recommendations: recommendations.slice(0, 8),
  };
}

export function formatMaturityReport(report: MaturityReport, markdown = false): string {
  const dims = [report.preparedness, report.operational, report.automation];
  const pctLabel = (d: MaturityDimension) => (d.pct == null ? "—" : `${d.pct}%`);
  if (!markdown) {
    const lines = [
      `OrgOS 成熟度: ${report.overall}% (${report.grade})`,
      "",
      ...dims.map((d) => `  ${d.label}: ${pctLabel(d)} — ${d.detail}`),
    ];
    if (report.recommendations.length) {
      lines.push("", "推奨:");
      for (const r of report.recommendations) lines.push(`  · ${r}`);
    }
    return lines.join("\n");
  }
  const lines = [
    `# OrgOS 成熟度`,
    "",
    `**総合:** ${report.overall}% · **${report.grade}**`,
    "",
    "| 次元 | スコア | 詳細 |",
    "|------|-------:|------|",
    ...dims.map((d) => `| ${d.label} | ${pctLabel(d)} | ${d.detail} |`),
    "",
    "> **準備度** = リポジトリ・規程・計画 / **運用度** = 実データ・記録・手続 / **自動化度** = CLI・検証・daily",
    "",
    "> スケルトンテナント（`lifecycle: skeleton`）では運用度は N/A。成熟度は準備度+自動化度の平均。",
  ];
  if (report.recommendations.length) {
    lines.push("", "## 推奨アクション", "");
    for (const r of report.recommendations) lines.push(`- ${r}`);
  }
  lines.push("", `*生成: \`steward status\`*`);
  return lines.join("\n");
}
