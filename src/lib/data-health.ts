import { existsSync } from "node:fs";
import {
  loadAllData,
  loadEmployees,
  loadYojitsuFyPlan,
  validateAll,
} from "./data.js";
import { runIntegrityChecks, summarizeIntegrity } from "./integrity.js";
import {
  getFiscalYearRange,
  listOperationsCatalogPaths,
  listOperationsModules,
  resolveModuleSecretsPath,
} from "./ops-config.js";
import { getDataDir, getStakeholdersYaml, resolveTenantPath, readYamlFile } from "./utils.js";
import { facilityPublicSchema } from "../../schemas/operations.js";

export interface HealthMetric {
  id: string;
  label: string;
  score: number;
  max: number;
  detail: string;
}

export interface DataHealthReport {
  overall: number;
  grade: string;
  metrics: HealthMetric[];
  recommendations: string[];
}

function gradeFromScore(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function computeDataHealth(): DataHealthReport {
  const metrics: HealthMetric[] = [];
  const recommendations: string[] = [];

  const validation = validateAll();
  metrics.push({
    id: "schema",
    label: "スキーマ検証",
    score: validation.ok ? 20 : 0,
    max: 20,
    detail: validation.ok ? "全 YAML 有効" : `${validation.errors.length} 件のエラー`,
  });
  if (!validation.ok) {
    recommendations.push("npm run validate でエラーを解消");
  }

  const integrity = runIntegrityChecks();
  const { errors, warnings } = summarizeIntegrity(integrity);
  const integrityScore = Math.max(0, 20 - errors * 5 - warnings);
  metrics.push({
    id: "integrity",
    label: "参照整合性",
    score: integrityScore,
    max: 20,
    detail: errors ? `エラー ${errors} · 警告 ${warnings}` : warnings ? `警告 ${warnings}` : "問題なし",
  });
  if (errors) recommendations.push("loan↔contract・property 参照エラーを修正");
  if (warnings) recommendations.push("欠落ドキュメントパス・TBD 項目を確認");

  const data = loadAllData();
  const executed = data.contracts.filter((c) => c.status === "executed");
  const withDoc = executed.filter((c) => c.documents?.executed);
  const docScore = executed.length ? Math.round((withDoc.length / executed.length) * 15) : 0;
  metrics.push({
    id: "contracts",
    label: "契約台帳",
    score: docScore,
    max: 15,
    detail: `${executed.length}/${data.contracts.length} executed · ${withDoc.length} 本文リンク`,
  });
  const draftHighRisk = data.contracts.filter(
    (c) => c.status === "draft" && (c.risk?.risk_level === "high" || c.type === "insurance")
  );
  if (draftHighRisk.length) {
    recommendations.push(`優先: ${draftHighRisk.map((c) => c.id).join(", ")} の手続完了`);
  }

  const fy = getFiscalYearRange();
  const fyMonths = 12;
  const fyFinance = data.monthlyFinances.filter((m) => m.month >= fy.from && m.month <= fy.to);
  const financeScore = Math.round((fyFinance.length / fyMonths) * 15);
  metrics.push({
    id: "finances",
    label: `月次収支 (${fy.id})`,
    score: financeScore,
    max: 15,
    detail: `${fyFinance.length}/${fyMonths} ヶ月`,
  });
  if (fyFinance.length < fyMonths) {
    recommendations.push(`${fy.id} 月次 YAML を ${fyMonths} ヶ月分そろえる`);
  }

  const fixedScore = data.fixedCosts.items.length > 0 ? 5 : 0;
  metrics.push({
    id: "fixed_costs",
    label: "本社固定費",
    score: fixedScore,
    max: 5,
    detail: data.fixedCosts.items.length ? `${data.fixedCosts.items.length} 項目` : "未登録",
  });

  const yojitsu = loadYojitsuFyPlan(fy.id);
  const yojitsuScore = yojitsu?.months.length === 12 && yojitsu.summary ? 10 : yojitsu ? 5 : 0;
  metrics.push({
    id: "yojitsu",
    label: "予実計画",
    score: yojitsuScore,
    max: 10,
    detail: yojitsu ? `${yojitsu.months.length} ヶ月${yojitsu.summary ? " · summary あり" : ""}` : "未作成",
  });

  const opsModules = listOperationsModules();
  let opsScore = 0;
  let publicOk = false;
  let secretsOk = true;
  for (const mod of opsModules) {
    if (mod.operationsPublic) {
      try {
        readYamlFile(resolveTenantPath(mod.operationsPublic), facilityPublicSchema);
        publicOk = true;
      } catch {
        recommendations.push(`${mod.operationsPublic} を整備`);
      }
    }
    if (mod.operationsSecrets) {
      const secretsPath = resolveModuleSecretsPath(mod.moduleId);
      if (!secretsPath || !existsSync(secretsPath)) {
        secretsOk = false;
        recommendations.push(`${mod.operationsSecrets} を作成（Wi-Fi・緊急連絡）`);
      }
    }
  }
  if (publicOk) opsScore = 5;
  if (publicOk && secretsOk && opsModules.some((m) => m.operationsSecrets)) {
    opsScore = 10;
  }
  metrics.push({
    id: "operations",
    label: "施設運用データ",
    score: opsScore,
    max: 10,
    detail: opsScore >= 10 ? "公開+secrets" : opsScore ? "公開のみ" : "未整備",
  });

  try {
    loadEmployees();
    metrics.push({
      id: "hr",
      label: "HR マスタ",
      score: 5,
      max: 5,
      detail: "スキーマ有効（従業員0名）",
    });
  } catch {
    metrics.push({ id: "hr", label: "HR マスタ", score: 0, max: 5, detail: "要修正" });
  }

  if (!existsSync(getStakeholdersYaml())) {
    recommendations.push(
      "stakeholders.yaml を example からコピー（利害関係者 · GitHub 非公開）"
    );
  }

  const overall = metrics.reduce((s, m) => s + m.score, 0);
  const maxTotal = metrics.reduce((s, m) => s + m.max, 0);
  const pct = Math.round((overall / maxTotal) * 100);

  return {
    overall: pct,
    grade: gradeFromScore(pct),
    metrics,
    recommendations: recommendations.slice(0, 6),
  };
}

export function formatHealthReport(report: DataHealthReport, markdown = false): string {
  if (!markdown) {
    const lines = [
      `OrgOS データ成熟度: ${report.overall}% (${report.grade})`,
      "",
      ...report.metrics.map((m) => `  ${m.label}: ${m.score}/${m.max} — ${m.detail}`),
    ];
    if (report.recommendations.length) {
      lines.push("", "推奨:");
      for (const r of report.recommendations) lines.push(`  · ${r}`);
    }
    return lines.join("\n");
  }

  const lines = [
    `# OrgOS データ成熟度`,
    "",
    `**総合:** ${report.overall}% · グレード **${report.grade}**`,
    "",
    "| 領域 | スコア | 詳細 |",
    "|------|-------:|------|",
    ...report.metrics.map((m) => `| ${m.label} | ${m.score}/${m.max} | ${m.detail} |`),
  ];
  if (report.recommendations.length) {
    lines.push("", "## 推奨アクション", "");
    for (const r of report.recommendations) lines.push(`- ${r}`);
  }
  lines.push("", `*生成: \`steward status\`*`);
  return lines.join("\n");
}

export function dataCatalogPaths(): string[] {
  const paths: string[] = [];
  const walk = (rel: string) => {
    const full = resolveTenantPath(rel);
    if (existsSync(full)) paths.push(rel);
  };
  walk("data/company.yaml");
  for (const rel of listOperationsCatalogPaths()) {
    walk(rel);
  }
  walk("data/hr/employees.yaml");
  walk("data/finance/loans.yaml");
  walk("data/finance/fixed-costs.yaml");
  walk("data/finance/payroll.yaml");
  return paths;
}
