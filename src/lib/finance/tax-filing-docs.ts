/**
 * Generate human-facing tax filing docs from YAML SSOT.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TaxProfile } from "../../../schemas/finance/types.js";
import type { FixedAssets } from "../../../schemas/finance/types.js";
import {
  loadFixedAssets,
  loadTaxProfile,
  loadYojitsuFyPlan,
} from "../data.js";
import { formatCurrency, getDocsDir, writeMarkdownReport } from "../utils.js";

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function statusCell(raw: string | undefined): string {
  if (!raw) return "TBD";
  const s = raw.toLowerCase();
  if (
    s === "done" ||
    s === "filed" ||
    s === "paid" ||
    s === "demo_confirmed" ||
    s === "not_required"
  ) {
    return "○";
  }
  if (raw === "該当なし見込み" || raw === "申告不要") return "—";
  return raw;
}

export function generateTaxFilingChecklistMarkdown(
  profile: TaxProfile,
  fiscalYearLabel?: string,
): string {
  const fy = profile.fiscal_year;
  const label = fiscalYearLabel ?? fy.label ?? "決算期";
  const period =
    fy.period_from && fy.period_to
      ? `${fy.period_from}〜${fy.period_to}`
      : `決算月 ${fy.end_month}月`;

  let yojitsuBlock = "";
  try {
    const yojitsu = loadYojitsuFyPlan("FY2026");
    if (yojitsu?.summary) {
      const s = yojitsu.summary;
      yojitsuBlock = [
        "",
        "## 数値サマリ（予実 YAML）",
        "",
        "| 項目 | 金額（円） |",
        "|------|----------:|",
        ...(typeof s.revenue_total === "number"
          ? [`| 売上高 | ${s.revenue_total.toLocaleString("ja-JP")} |`]
          : []),
        ...(typeof s.operating_profit === "number"
          ? [`| 営業利益 | ${s.operating_profit.toLocaleString("ja-JP")} |`]
          : []),
        ...(typeof s.pretax_profit === "number"
          ? [`| 税引前当期純利益 | ${s.pretax_profit.toLocaleString("ja-JP")} |`]
          : []),
        ...(typeof s.tax_estimate === "number"
          ? [`| 法人税等（暫定） | ${s.tax_estimate.toLocaleString("ja-JP")} |`]
          : []),
        ...(typeof s.net_profit === "number"
          ? [`| 当期純利益（暫定） | ${s.net_profit.toLocaleString("ja-JP")} |`]
          : []),
      ].join("\n");
    }
  } catch {
    /* optional */
  }

  const scheduleRows = (profile.filing_calendar ?? [])
    .map(
      (it) =>
        `| ${it.tax} | ${it.deadline ?? "TBD"} | ${it.authority ?? "—"} | ${statusCell(it.status)} |`,
    )
    .join("\n");

  return [
    `# 税務申告チェックリスト — ${label}`,
    "",
    `**${profile.entity.name} · ${period} · 決算月${fy.end_month}月**`,
    "**正データ:** [`data/finance/tax-profile.yaml`](../../../data/finance/tax-profile.yaml)",
    "",
    "*本ファイルは `orgos skills run tax-filing-prep` により正データから生成されます。*",
    "",
    "## 申告スケジュール",
    "",
    "| 税目 | 期限 | 提出先 | 状態 |",
    "|------|------|--------|:----:|",
    scheduleRows || "| — | — | — | — |",
    "",
    "## 区分・見込",
    "",
    `- 消費税: ${profile.consumption_tax?.status ?? "TBD"}`,
    `- 法人税見込: ${
      profile.corporate_tax?.estimated_tax_fy2026 != null
        ? formatCurrency(profile.corporate_tax.estimated_tax_fy2026)
        : "TBD"
    }（${profile.corporate_tax?.estimated_tax_status ?? "—"}）`,
    `- インボイス: ${
      profile.consumption_tax?.invoice_registered
        ? profile.consumption_tax.invoice_registration_number ?? "登録済"
        : "未登録"
    }`,
    yojitsuBlock,
    "",
    "## 実行 CLI",
    "",
    "```bash",
    "npm run validate",
    "npm run orgos -- deps check --file data/finance/fixed-assets.yaml",
    "npm run orgos -- tax calendar",
    "npm run orgos -- tax gaps",
    "npm run orgos -- report kessan",
    "```",
    "",
    `*生成: orgos skills run tax-filing-prep · ${new Date().toISOString().slice(0, 10)}*`,
  ].join("\n");
}

export function generateFixedAssetRegisterMarkdown(fa: FixedAssets): string {
  const summary = fa.summary;
  const assetRows = fa.assets
    .map((a) => {
      return [
        "",
        `### ${a.id} ${a.name}`,
        "",
        "| 項目 | 内容 |",
        "|------|------|",
        ...(a.property_id ? [`| 物件 | ${a.property_id} |`] : []),
        ...(a.loan_id ? [`| 借入 | ${a.loan_id} |`] : []),
        ...(a.acquisition_date ? [`| 取得日 | ${a.acquisition_date} |`] : []),
        ...(a.acquisition_cost != null
          ? [`| 取得原価 | ${formatCurrency(a.acquisition_cost)} |`]
          : []),
        ...(a.useful_life_years != null
          ? [`| 耐用年数 | ${a.useful_life_years}年 |`]
          : []),
        ...(a.annual_depreciation != null
          ? [`| 年間償却額 | ${formatCurrency(a.annual_depreciation)} |`]
          : []),
        ...(a.accumulated_depreciation != null
          ? [`| 償却累計 | ${formatCurrency(a.accumulated_depreciation)} |`]
          : []),
        ...(a.book_value != null
          ? [`| 帳簿価額 | ${formatCurrency(a.book_value)} |`]
          : []),
      ].join("\n");
    })
    .join("\n");

  return [
    `# 固定資産台帳（${fa.fiscal_year ?? "期末"}）`,
    "",
    `**基準日 ${fa.as_of ?? "—"}**`,
    "**正データ:** [`data/finance/fixed-assets.yaml`](../../../data/finance/fixed-assets.yaml)",
    "",
    "*本ファイルは `orgos skills run tax-filing-prep` により正データから生成されます。*",
    "",
    "## 概要",
    "",
    "| 項目 | 金額（円） |",
    "|------|----------:|",
    ...(summary?.total_acquisition_cost != null
      ? [`| 取得原価合計 | ${summary.total_acquisition_cost.toLocaleString("ja-JP")} |`]
      : []),
    ...(summary?.total_accumulated_depreciation != null
      ? [
          `| 減価償却累計 | ${summary.total_accumulated_depreciation.toLocaleString("ja-JP")} |`,
        ]
      : []),
    ...(summary?.total_book_value != null
      ? [`| 帳簿価額合計 | ${summary.total_book_value.toLocaleString("ja-JP")} |`]
      : []),
    ...(summary?.annual_depreciation_fy_current != null
      ? [
          `| 当期減価償却費 | ${summary.annual_depreciation_fy_current.toLocaleString("ja-JP")} |`,
        ]
      : []),
    assetRows,
    "",
    `*生成: orgos skills run tax-filing-prep · ${new Date().toISOString().slice(0, 10)}*`,
  ].join("\n");
}

export function writeTaxFilingDocs(): { checklist: string; register: string } {
  const profile = loadTaxProfile() as TaxProfile;
  const fa = loadFixedAssets();
  const checklistPath = join(getDocsDir(), "finance", "tax-filing-checklist.md");
  const registerPath = join(getDocsDir(), "finance", "fixed-asset-register.md");
  ensureParent(checklistPath);
  ensureParent(registerPath);
  const checklistMd = generateTaxFilingChecklistMarkdown(profile);
  const registerMd = generateFixedAssetRegisterMarkdown(fa);
  writeFileSync(checklistPath, checklistMd, "utf-8");
  writeFileSync(registerPath, registerMd, "utf-8");
  return { checklist: checklistPath, register: registerPath };
}

export function writeTaxPrepSummaryMarkdown(
  lines: string[],
  filename?: string,
): string {
  const name = filename ?? `${new Date().toISOString().slice(0, 10)}-tax-prep.md`;
  return writeMarkdownReport("agent-summaries/tax", name, lines.join("\n"));
}
