/**
 * Internal financial audit workpapers (not external auditor opinion).
 * ADR 0069 framework: financial.
 */
import { getDocsDir, writeTrackedFile } from "../utils.js";
import { getInstallRoot, loadTenantConfig } from "../tenant.js";
import { assessEntityModuleMismatches } from "./entity-module-guards.js";
import { loadChartOfAccounts } from "../data.js";
import { loadJournalEntries } from "./expense-claim-journal.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadPeriodLocks } from "./period-lock.js";
import {
  assessPresentationSanity,
  formatPresentationSanityMarkdown,
} from "./financial-presentation-sanity.js";

export type FinancialAuditWorkpapers = {
  period: string;
  paths: string[];
  assertions: string[];
  notes: string[];
};

function periodBounds(period: string): { from: string; to: string; label: string } {
  if (/^\d{4}$/.test(period)) {
    return {
      from: `${period}-01-01`,
      to: `${period}-12-31`,
      label: `${period}年（暦年）`,
    };
  }
  if (/^\d{4}-\d{2}$/.test(period)) {
    return {
      from: `${period}-01`,
      to: `${period}-31`,
      label: period,
    };
  }
  return { from: period, to: period, label: period };
}

export function writeFinancialAuditWorkpapers(period: string): FinancialAuditWorkpapers {
  const bounds = periodBounds(period);
  const cfg = loadTenantConfig();
  const dir = join(getDocsDir(), "audit", "financial", period);
  mkdirSync(dir, { recursive: true });
  const paths: string[] = [];
  const notes: string[] = [
    "外部会計監査人の意見・保証ではない（ADR 0069）。内部ワークペーパー。",
    "J-SOX / ISO 内部監査と混同しないこと。",
  ];
  for (const w of assessEntityModuleMismatches()) {
    notes.push(`warning: ${w}`);
  }

  const trial = buildTrialBalance({ asOf: bounds.to.slice(0, 10) });
  const coa = loadChartOfAccounts();
  let entryCount = 0;
  try {
    entryCount = loadJournalEntries().entries.filter((e) => {
      const d = e.occurred_at.slice(0, 10);
      return d >= bounds.from.slice(0, 10) && d <= bounds.to.slice(0, 10);
    }).length;
  } catch {
    entryCount = 0;
  }

  let periodLockCount = 0;
  try {
    const prefix = bounds.from.slice(0, 4);
    periodLockCount = loadPeriodLocks().locks.filter((l) =>
      l.month.startsWith(prefix),
    ).length;
  } catch {
    periodLockCount = 0;
  }
  if (periodLockCount === 0 && /^\d{4}$/.test(period)) {
    notes.push(
      `warning: ${period} 年の period-locks が 0 件 — 締めロック未実施の可能性`,
    );
  }

  // Baseline is never written from workpapers — only CLI --update-baseline.
  const sanity = assessPresentationSanity({ period, updateBaseline: false });
  for (const f of sanity.findings) {
    if (f.code === "journal_hash_baseline_missing") {
      notes.push(
        `info: [${f.code}] ${f.message} — 更新は orgos operations financial-audit presentation-sanity --period ${period} --update-baseline`,
      );
      continue;
    }
    if (f.level === "info") continue;
    notes.push(`${f.level}: [${f.code}] ${f.message}`);
  }
  const sanityErrors = sanity.findings.filter((f) => f.level === "error").length;
  const sanityWarnings = sanity.findings.filter((f) => f.level === "warning").length;

  const indexMd = [
    `# 財務アサーション ワークペーパー — ${bounds.label}`,
    "",
    `テナント: ${cfg.name}（${cfg.id}）`,
    `期間: ${bounds.from} 〜 ${bounds.to}`,
    "",
    ...notes.map((n) => `- ${n}`),
    "",
    "## アサーション",
    "",
    "| アサーション | 手続概要 | 結果欄（人間） |",
    "|--------------|----------|----------------|",
    "| 実在性 Existence | 試算表残高と補助元帳・証憑の突合 | |",
    "| 網羅性 Completeness | 期間仕訳件数・締めロック | |",
    "| 評価 Valuation | 資産評価・減価償却（別紙） | |",
    "| 期間帰属 Cut-off | 期末前後の仕訳カットオフ | |",
    `| 表示 Presentation | 主要科目 · 表示健全性（error ${sanityErrors} / warning ${sanityWarnings}） | |`,
    "",
    "## 機械サマリ",
    "",
    `- CoA 科目数: ${coa.accounts.length}`,
    `- 試算表行数: ${trial.rows.length}`,
    `- 試算貸借一致: ${trial.balanced ? "はい" : "いいえ"}`,
    `- 期間内仕訳件数: ${entryCount}`,
    `- 期間内 period-locks 件数: ${periodLockCount}`,
    "",
    "## 署名",
    "",
    "| 役割 | 氏名 | 日付 |",
    "|------|------|------|",
    "| 実施者 | | |",
    "| レビュー | | |",
    "",
    "テンプレ原本: `steward/standards/audit/financial/templates/`",
    "",
    "ISO 内部監査との境界: 本 WP は財務アサーション（ADR 0069 financial）。ISO 記録検査は `orgos iso records check`。",
  ].join("\n");
  paths.push(writeTrackedFile(join(dir, "00-index.md"), indexMd));
  paths.push(
    writeTrackedFile(
      join(dir, "presentation-sanity.md"),
      formatPresentationSanityMarkdown(sanity),
    ),
  );

  const tbMd = [
    `# 試算表タイアウト — ${bounds.to.slice(0, 10)}`,
    "",
    "| コード | 科目 | 借方 | 貸方 | 残高 |",
    "|--------|------|-----:|-----:|-----:|",
    ...trial.rows.map(
      (r) =>
        `| ${r.account_code} | ${r.account_name} | ${r.debit_total_yen} | ${r.credit_total_yen} | ${r.balance_yen} |`,
    ),
    "",
    `balanced: ${trial.balanced}`,
  ].join("\n");
  paths.push(writeTrackedFile(join(dir, "trial-balance-tie-out.md"), tbMd));

  const checklistSrc = join(
    getInstallRoot(),
    "steward/standards/audit/financial/templates/month-close-checklist.md",
  );
  let closeBody = "（テンプレ未配置）";
  if (existsSync(checklistSrc)) {
    closeBody = readFileSync(checklistSrc, "utf-8");
  }
  paths.push(
    writeTrackedFile(
      join(dir, "month-close-checklist.md"),
      `# 月次締めチェック — ${period}\n\n${closeBody}`,
    ),
  );

  const subledgerCsv = join(
    getInstallRoot(),
    "steward/standards/audit/financial/templates/subledger-tie-out.csv",
  );
  if (existsSync(subledgerCsv)) {
    paths.push(
      writeTrackedFile(
        join(dir, "subledger-tie-out.csv"),
        readFileSync(subledgerCsv, "utf-8"),
      ),
    );
  }

  return {
    period,
    paths,
    assertions: ["existence", "completeness", "valuation", "cut_off", "presentation"],
    notes,
  };
}

export function writeFinancialAuditPlanStub(period: string): { path: string } {
  const dir = join(getDocsDir(), "audit", "financial", period);
  mkdirSync(dir, { recursive: true });
  const path = writeTrackedFile(
    join(dir, "plan-stub.md"),
    [
      `# 財務監査計画スタブ — ${period}`,
      "",
      "framework: financial（ADR 0069）",
      "",
      "本ファイルは内部計画の下書き。正式な IAP は `iso audit plan create --framework financial` を使用。",
      "",
      "- 対象期間: " + period,
      "- 外部監査意見は対象外",
    ].join("\n"),
  );
  return { path };
}

export function writeFinancialAuditConcludeStub(period: string): { path: string } {
  const dir = join(getDocsDir(), "audit", "financial", period);
  mkdirSync(dir, { recursive: true });
  const path = writeTrackedFile(
    join(dir, "conclude-stub.md"),
    [
      `# 財務アサーション 結論スタブ — ${period}`,
      "",
      "機械は結論を出さない。人間が所見を記入する。",
      "",
      "- [ ] 重大な不備なし",
      "- [ ] 軽微な指摘あり（下記）",
      "- [ ] 追加手続が必要",
      "",
      "所見:",
      "",
      "署名: ________ 日付: ________",
    ].join("\n"),
  );
  return { path };
}
