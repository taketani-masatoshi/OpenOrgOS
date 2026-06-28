import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  loadContracts,
  loadFixedAssets,
  loadInvestmentPlan,
  loadTaxProfile,
} from "./data.js";
import { getDataDir, writeMarkdownReport } from "./utils.js";

const TAX_FILES = [
  "finance/fixed-assets.yaml",
  "finance/tax-profile.yaml",
  "finance/chart-of-accounts.yaml",
  "finance/cash-balance.yaml",
  "finance/loans.yaml",
  "finance/payroll.yaml",
] as const;

export function runTaxFilingPrepSkill(opts: { output?: string; markdown?: boolean } = {}): void {
  const missing: string[] = [];
  const present: string[] = [];
  for (const rel of TAX_FILES) {
    const path = join(getDataDir(), rel);
    (existsSync(path) ? present : missing).push(rel);
  }

  let assetsCount = 0;
  let filingItems = 0;
  try {
    assetsCount = loadFixedAssets().assets.length;
  } catch {
    /* optional */
  }
  try {
    filingItems = loadTaxProfile().filing_calendar.length;
  } catch {
    /* optional */
  }

  const lines = [
    "# 税務申告準備サマリ",
    "",
    `正データ: ${present.length}/${TAX_FILES.length} ファイル存在`,
    "",
    "## 存在",
    ...present.map((f) => `- data/${f}`),
    "",
    "## 未作成",
    ...(missing.length ? missing.map((f) => `- data/${f}`) : ["- （なし）"]),
    "",
    `固定資産: ${assetsCount} 件 · 申告カレンダー: ${filingItems} 件`,
    "",
    "次: `npm run validate` · `npm run orgos -- deps check --file data/finance/fixed-assets.yaml`",
  ];

  const md = lines.join("\n");
  if (opts.output) {
    const path = writeMarkdownReport("agent-summaries/finance", opts.output, md);
    console.log(`Wrote ${path}`);
  } else {
    console.log(md);
  }
}

export function runContractRegisterSkill(opts: { output?: string; markdown?: boolean } = {}): void {
  const contracts = loadContracts();
  const byStatus = contracts.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  const lines = [
    "# 契約台帳サマリ",
    "",
    `契約数: ${contracts.length}`,
    "",
    "## ステータス別",
    ...Object.entries(byStatus)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([status, n]) => `- ${status}: ${n}`),
    "",
    "次: `npm run orgos -- sync contracts` · `npm run validate`",
  ];

  const md = lines.join("\n");
  if (opts.output) {
    const path = writeMarkdownReport("agent-summaries/contract", opts.output, md);
    console.log(`Wrote ${path}`);
  } else {
    console.log(md);
  }
}

export function runCapexPlanningSkill(opts: { output?: string; markdown?: boolean } = {}): void {
  let yearCount = 0;
  let currency = "—";
  try {
    const plan = loadInvestmentPlan();
    currency = plan.currency;
    yearCount = plan.years.length;
  } catch {
    /* optional */
  }

  const lines = [
    "# CAPEX 計画サマリ",
    "",
    `investment-plan: ${currency} · ${yearCount} 年度ブロック`,
    "",
    "正本: data/plans/investment-plan.yaml",
    "",
    "次: `npm run orgos -- deps check --file data/plans/investment-plan.yaml` · `npm run validate`",
  ];

  const md = lines.join("\n");
  if (opts.output) {
    const path = writeMarkdownReport("agent-summaries/finance", opts.output, md);
    console.log(`Wrote ${path}`);
  } else {
    console.log(md);
  }
}
