/**
 * Tax module readiness — practical depth score (distinct from agent-readiness %).
 * e-Tax / return XML generation are out of scope and excluded from the denominator.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveRegisteredSkillInvocation } from "../../commands/skills.js";
import { buildTaxCalendarPortfolio } from "./tax-calendar-portfolio.js";
import { runConsumptionTaxCheck } from "./consumption-tax.js";
import { verifyAllFixedAssetDepreciation } from "./depreciation.js";
import { assessInvoiceRegistration } from "./invoice-qualified.js";
import {
  summarizeTaxFilingGaps,
  tryLoadTaxFilingGaps,
} from "./tax-filing-gaps.js";
import { getDataDir, getDocsDir } from "../utils.js";

const JP_TAX_SKILL_IDS = [
  "jp_corporate_tax_return",
  "jp_consumption_tax_return",
  "jp_invoice_registration",
  "jp_qualified_invoice_issue",
  "jp_withholding_payment",
] as const;

const REQUIRED_DATA = [
  "finance/tax-profile.yaml",
  "finance/fixed-assets.yaml",
] as const;

const GENERATED_DOCS = [
  "finance/tax-filing-checklist.md",
  "finance/fixed-asset-register.md",
] as const;

export type TaxReadinessAxis = {
  id: string;
  label: string;
  score: number;
  max: number;
  detail: string;
};

export type TaxReadinessResult = {
  /** Machine score — open/warning/blocking on active gaps only */
  pct: number;
  total: number;
  max: number;
  axes: TaxReadinessAxis[];
  gaps: string[];
  out_of_scope: string[];
  /** deferred + tax_advisor handoff */
  advisor_pending: number;
  deferred: number;
  /** true when advisor_pending === 0 and no open blocking/warning */
  filing_ready: boolean;
};

function scoreDataSot(): TaxReadinessAxis {
  const max = 15;
  let hits = 0;
  const missing: string[] = [];
  for (const rel of REQUIRED_DATA) {
    if (existsSync(join(getDataDir(), rel))) hits++;
    else missing.push(rel);
  }
  const score = Math.round((hits / REQUIRED_DATA.length) * max);
  return {
    id: "data_sot",
    label: "データSoT",
    score,
    max,
    detail: missing.length ? `missing: ${missing.join(", ")}` : "tax-profile · fixed-assets OK",
  };
}

function scoreCalendar(): TaxReadinessAxis {
  const max = 15;
  try {
    const portfolio = buildTaxCalendarPortfolio({});
    const ok = portfolio.rows.length > 0;
    return {
      id: "calendar",
      label: "期限カレンダー",
      score: ok ? max : Math.round(max * 0.4),
      max,
      detail: ok
        ? `${portfolio.rows.length} 行 · 3M流出 ${portfolio.stats.outflow_3m_jpy.toLocaleString("ja-JP")} 円`
        : "rhythm 展開行なし",
    };
  } catch (e) {
    return {
      id: "calendar",
      label: "期限カレンダー",
      score: 0,
      max,
      detail: e instanceof Error ? e.message : "calendar build failed",
    };
  }
}

function scoreGapsOverlay(): TaxReadinessAxis {
  const max = 15;
  const gaps = tryLoadTaxFilingGaps();
  if (!gaps) {
    return {
      id: "gaps",
      label: "申告ギャップ",
      score: Math.round(max * 0.5),
      max,
      detail: "tax-filing-gaps.yaml なし（任意）",
    };
  }
  const summary = summarizeTaxFilingGaps(gaps);
  let score = max - summary.blocking * 5 - summary.warning * 2;
  score = Math.max(0, Math.min(max, score));
  return {
    id: "gaps",
    label: "申告ギャップ",
    score,
    max,
    detail: `open ${summary.open} · deferred ${summary.deferred} · blocking ${summary.blocking} · warning ${summary.warning}`,
  };
}

function scoreConsumptionInvoice(): TaxReadinessAxis {
  const max = 15;
  const consumption = runConsumptionTaxCheck();
  const invoice = assessInvoiceRegistration();
  const blocking =
    consumption.issues.filter((i) => i.severity === "blocking").length +
    invoice.issues.filter((i) => i.severity === "blocking").length;
  const warnings =
    consumption.issues.filter((i) => i.severity === "warning").length +
    invoice.issues.filter((i) => i.severity === "warning").length;
  let score = max - blocking * 5 - warnings * 2;
  score = Math.max(0, Math.min(max, score));
  return {
    id: "consumption_invoice",
    label: "消費税・インボイス",
    score,
    max,
    detail: `blocking ${blocking} · warning ${warnings} · status ${consumption.status}`,
  };
}

function scoreDepreciation(): TaxReadinessAxis {
  const max = 15;
  const result = verifyAllFixedAssetDepreciation();
  const score =
    result.issues.length === 0
      ? max
      : Math.max(0, max - result.issues.length * 3);
  return {
    id: "depreciation",
    label: "減価償却検算",
    score,
    max,
    detail:
      result.issues.length === 0
        ? `${result.asset_count} 資産 · 警告なし`
        : `${result.issues.length} 警告`,
  };
}

function scoreSkillDispatch(): TaxReadinessAxis {
  const max = 15;
  let ready = 0;
  const unwired: string[] = [];
  for (const id of JP_TAX_SKILL_IDS) {
    const resolution = resolveRegisteredSkillInvocation(id);
    if (resolution.status === "ready") ready++;
    else unwired.push(id);
  }
  const score = Math.round((ready / JP_TAX_SKILL_IDS.length) * max);
  return {
    id: "skill_dispatch",
    label: "JP skill 配線",
    score,
    max,
    detail:
      unwired.length === 0
        ? `${ready}/${JP_TAX_SKILL_IDS.length} ready`
        : `ready ${ready}/${JP_TAX_SKILL_IDS.length} · unwired: ${unwired.join(", ")}`,
  };
}

function scoreGeneratedDocs(): TaxReadinessAxis {
  const max = 10;
  let hits = 0;
  const missing: string[] = [];
  for (const rel of GENERATED_DOCS) {
    if (existsSync(join(getDocsDir(), rel))) hits++;
    else missing.push(rel);
  }
  const score = Math.round((hits / GENERATED_DOCS.length) * max);
  return {
    id: "generated_docs",
    label: "生成ドキュメント",
    score,
    max,
    detail:
      missing.length === 0
        ? "checklist · register あり"
        : `missing: ${missing.join(", ")}`,
  };
}

export function computeTaxReadiness(): TaxReadinessResult {
  const axes = [
    scoreDataSot(),
    scoreCalendar(),
    scoreGapsOverlay(),
    scoreConsumptionInvoice(),
    scoreDepreciation(),
    scoreSkillDispatch(),
    scoreGeneratedDocs(),
  ];
  const total = axes.reduce((s, a) => s + a.score, 0);
  const max = axes.reduce((s, a) => s + a.max, 0);
  const pct = max > 0 ? Math.round((total / max) * 100) : 0;
  const gaps = axes.filter((a) => a.score < a.max * 0.8).map((a) => `${a.label}: ${a.detail}`);
  const gapSummary = summarizeTaxFilingGaps(tryLoadTaxFilingGaps());
  const advisor_pending = gapSummary.advisor_pending;
  const deferred = gapSummary.deferred;
  const filing_ready =
    gapSummary.open === 0 &&
    gapSummary.blocking === 0 &&
    gapSummary.warning === 0 &&
    advisor_pending === 0;
  return {
    pct,
    total,
    max,
    axes,
    gaps,
    out_of_scope: [
      "e-Tax / eLTAX 本番提出",
      "申告書 XML の行政提出（ドラフト生成は可）",
    ],
    advisor_pending,
    deferred,
    filing_ready,
  };
}

export function formatTaxReadinessMarkdown(result: TaxReadinessResult): string {
  const lines = [
    "# Tax Readiness — 税務モジュール実務深度",
    "",
    `**${result.pct}%**（${result.total}/${result.max}）— 機械指標 · agent-readiness とは別`,
    "",
  ];
  if (result.advisor_pending > 0) {
    lines.push(
      `**税理士回答待ち:** ${result.advisor_pending} 件（deferred ${result.deferred}）— **申告確定前**`,
      "",
    );
  }
  if (result.filing_ready) {
    lines.push("**申告準備（人間含む）:** filing_ready ✓", "");
  }
  lines.push("| 軸 | 点 | 詳細 |", "|-----|---:|------|");
  for (const a of result.axes) {
    lines.push(`| ${a.label} | ${a.score}/${a.max} | ${a.detail} |`);
  }
  lines.push("", "## スコープ外（分母に含めない）", "");
  for (const item of result.out_of_scope) {
    lines.push(`- ${item}`);
  }
  if (result.gaps.length) {
    lines.push("", "## 80% 未満の軸", "");
    for (const g of result.gaps) {
      lines.push(`- ${g}`);
    }
  }
  return lines.join("\n");
}
