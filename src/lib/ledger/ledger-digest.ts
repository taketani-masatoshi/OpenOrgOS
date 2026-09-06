/**
 * Ledger digest — L1 trial / reconcile / period-lock summary for Console static-top.
 */
import { buildLedgerWorkbench } from "../finance/ledger/workbench.js";
import { currentDate, writeMarkdownReport } from "../utils.js";
import {
  loadLedgerDigestSlot,
  loadLedgerDigestSlots,
  type StaticReportSlot,
} from "../static-report-slot.js";
import {
  monthTokenFromAsOf,
  periodDigestFilename,
  type DigestPeriod,
} from "../period-digest-slot.js";

function yen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")} 円`;
}

export function buildLedgerDigestMarkdown(opts?: {
  asOf?: string;
  period?: DigestPeriod;
}): string {
  const as_of = opts?.asOf?.trim() || currentDate();
  const period = opts?.period ?? "weekly";
  const snap = buildLedgerWorkbench({ asOf: as_of });
  const label = period === "weekly" ? "帳簿週次" : "帳簿月次";
  const locked = snap.period_locks.filter((l) => l.status === "locked").length;

  const lines = [
    `# ${label} — ${as_of}`,
    "",
    `**期間:** ${period}`,
    "",
    "**境界:** L1 試算・消込件数・締状況のみ。仕訳本文・相手先詳細は含めない。",
    "",
    "## 試算表",
    "",
    `- 均衡: ${snap.trial_balance.balanced ? "はい" : "いいえ"}`,
    `- 借方合計: ${yen(snap.trial_balance.debit_total_yen)}`,
    `- 貸方合計: ${yen(snap.trial_balance.credit_total_yen)}`,
    `- 勘定科目行: ${snap.trial_balance.rows.length}`,
    "",
    "## 損益（概要）",
    "",
    `- 収益: ${yen(snap.profit_and_loss.revenue_total_yen)}`,
    `- 費用: ${yen(snap.profit_and_loss.expense_total_yen)}`,
    `- 当期利益: ${yen(snap.profit_and_loss.net_profit_yen)}`,
    "",
    "## 銀行消込",
    "",
    `- 未消込: ${snap.bank_reconcile.unmatched_count}`,
    "",
    "## 期間ロック",
    "",
    `- ロック済み月: ${locked} / ${snap.period_locks.length}`,
    "",
  ];
  return lines.join("\n");
}

export function writeLedgerDigest(opts?: {
  asOf?: string;
  period?: DigestPeriod;
}): {
  path: string;
  as_of: string;
  markdown: string;
  period: DigestPeriod;
} {
  const as_of = opts?.asOf?.trim() || currentDate();
  const period = opts?.period ?? "weekly";
  const markdown = buildLedgerDigestMarkdown({ asOf: as_of, period });
  const token = period === "monthly" ? monthTokenFromAsOf(as_of) : as_of;
  const filename = periodDigestFilename(period, token);
  const path = writeMarkdownReport("ledger", filename, markdown);
  return { path, as_of: token, markdown, period };
}

export function getLedgerStaticReportSlot(): StaticReportSlot {
  return loadLedgerDigestSlot();
}

export function getLedgerStaticReportSlots(): {
  weekly: StaticReportSlot;
  monthly: StaticReportSlot;
} {
  return loadLedgerDigestSlots();
}
