import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  loadAllData,
  loadEmployees,
  loadOperationsPublic,
  loadYojitsuFyPlan,
  validateAll,
} from "./data.js";
import { runIntegrityChecks, summarizeIntegrity } from "./integrity.js";
import { CURSOR_DIR, DATA_DIR, ROOT_DIR } from "./utils.js";

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

  const fyMonths = 12;
  const fyFrom = "2026-02";
  const fyTo = "2027-01";
  const fyFinance = data.monthlyFinances.filter((m) => m.month >= fyFrom && m.month <= fyTo);
  const financeScore = Math.round((fyFinance.length / fyMonths) * 15);
  metrics.push({
    id: "finances",
    label: "月次収支 (FY2026)",
    score: financeScore,
    max: 15,
    detail: `${fyFinance.length}/${fyMonths} ヶ月`,
  });
  if (fyFinance.length < fyMonths) {
    recommendations.push(`FY2026 月次 YAML を ${fyMonths} ヶ月分そろえる`);
  }

  const fixedScore = data.fixedCosts.items.length > 0 ? 5 : 0;
  metrics.push({
    id: "fixed_costs",
    label: "本社固定費",
    score: fixedScore,
    max: 5,
    detail: data.fixedCosts.items.length ? `${data.fixedCosts.items.length} 項目` : "未登録",
  });

  const yojitsu = loadYojitsuFyPlan("FY2026");
  const yojitsuScore = yojitsu?.months.length === 12 && yojitsu.summary ? 10 : yojitsu ? 5 : 0;
  metrics.push({
    id: "yojitsu",
    label: "予実計画",
    score: yojitsuScore,
    max: 10,
    detail: yojitsu ? `${yojitsu.months.length} ヶ月${yojitsu.summary ? " · summary あり" : ""}` : "未作成",
  });

  let opsScore = 0;
  try {
    loadOperationsPublic();
    opsScore = 5;
    if (!existsSync(join(CURSOR_DIR, "data", "operations", "kamezawa-secrets.yaml"))) {
      recommendations.push("kamezawa-secrets.yaml を作成（Wi-Fi・緊急連絡）");
    } else {
      opsScore = 10;
    }
  } catch {
    recommendations.push("operations/kamezawa-public.yaml を整備");
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
      `Steward OS データ成熟度: ${report.overall}% (${report.grade})`,
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
    `# Steward OS データ成熟度`,
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
    const full = join(ROOT_DIR, rel);
    if (existsSync(full)) paths.push(rel);
  };
  walk("cursor/data/company.yaml");
  walk("cursor/data/operations/kamezawa-public.yaml");
  walk("cursor/data/hr/employees.yaml");
  walk("cursor/data/finances/loans.yaml");
  walk("cursor/data/finances/fixed-costs.yaml");
  walk("cursor/data/finances/payroll.yaml");
  return paths;
}
