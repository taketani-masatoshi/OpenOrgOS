/**
 * 外注・報酬料金の支払源泉と支払調書ドラフト（提出 XML なし）。
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_REWARD_FEE_WITHHOLDING_RATE_PCT,
  withholdingPaymentsFileSchema,
  type WithholdingPayment,
  type WithholdingPaymentsFile,
} from "../../../schemas/finance/withholding-payments.js";
import { getDataDir, getDocsDir, readYamlFile, writeTrackedFile } from "../utils.js";
import { loadChartOfAccounts } from "../data.js";
import { buildBlueReturnKessan } from "./sole-proprietor-blue-return.js";

export function computeWithholdingYen(
  grossYen: number,
  ratePct: number = DEFAULT_REWARD_FEE_WITHHOLDING_RATE_PCT,
): number {
  return Math.floor((Math.max(0, grossYen) * ratePct) / 100);
}

export function resolvePaymentAmounts(p: WithholdingPayment): {
  rate_pct: number;
  withholding_yen: number;
  net_yen: number;
} {
  const rate_pct = p.withholding_rate_pct ?? DEFAULT_REWARD_FEE_WITHHOLDING_RATE_PCT;
  const withholding_yen = p.withholding_yen ?? computeWithholdingYen(p.gross_yen, rate_pct);
  return {
    rate_pct,
    withholding_yen,
    net_yen: p.gross_yen - withholding_yen,
  };
}

export function loadWithholdingPayments(): WithholdingPaymentsFile {
  const path = join(getDataDir(), "finance", "withholding-payments.yaml");
  if (!existsSync(path)) {
    return withholdingPaymentsFileSchema.parse({ version: 1, payments: [] });
  }
  return readYamlFile(path, withholdingPaymentsFileSchema);
}

export function filterPaymentsForYear(
  file: WithholdingPaymentsFile,
  calendarYear: number,
): WithholdingPayment[] {
  const prefix = `${calendarYear}-`;
  return file.payments.filter((p) => p.paid_at.startsWith(prefix));
}

export function buildPaymentJournalDraftMarkdown(
  payment: WithholdingPayment,
): string {
  const amounts = resolvePaymentAmounts(payment);
  const coa = loadChartOfAccounts();
  const whCode =
    coa.journal_source_accounts?.withholding_payable ?? "2120";
  const bank = coa.journal_source_accounts?.bank_control ?? "1100";
  return [
    `# 仕訳案 — ${payment.payment_id}`,
    "",
    `支払先: ${payment.payee_name} · ${payment.paid_at}`,
    `総額 ${payment.gross_yen.toLocaleString("ja-JP")} · 源泉 ${amounts.withholding_yen.toLocaleString("ja-JP")}（${amounts.rate_pct}%） · 差引 ${amounts.net_yen.toLocaleString("ja-JP")}`,
    "",
    "| 科目 | 借方 | 貸方 |",
    "|------|-----:|-----:|",
    `| ${payment.expense_account_code} 経費 | ${payment.gross_yen.toLocaleString("ja-JP")} | 0 |`,
    `| ${whCode} 預り金-源泉 | 0 | ${amounts.withholding_yen.toLocaleString("ja-JP")} |`,
    `| ${bank} 現金及び預金 | 0 | ${amounts.net_yen.toLocaleString("ja-JP")} |`,
    "",
    "正本への append は人間確認後（本コマンドは案のみ）。",
  ].join("\n");
}

export function writeWithholdingPaymentJournalDrafts(calendarYear: number): {
  paths: string[];
  count: number;
} {
  const file = loadWithholdingPayments();
  const payments = filterPaymentsForYear(file, calendarYear);
  const dir = join(
    getDocsDir(),
    "finance",
    "tax",
    "withholding",
    String(calendarYear),
    "journal-drafts",
  );
  mkdirSync(dir, { recursive: true });
  const paths: string[] = [];
  for (const p of payments) {
    const path = join(dir, `${p.payment_id}.md`);
    writeTrackedFile(path, buildPaymentJournalDraftMarkdown(p));
    paths.push(path);
  }
  return { paths, count: payments.length };
}

export type PaymentSlipRow = {
  payee_name: string;
  payment_count: number;
  gross_yen: number;
  withholding_yen: number;
};

export function buildPaymentSlipsDraft(calendarYear: number): {
  rows: PaymentSlipRow[];
  total_gross: number;
  total_withholding: number;
  markdown: string;
  outsourcing_expense_yen: number;
  variance_vs_outsourcing_line: number | null;
  issues: string[];
} {
  const payments = filterPaymentsForYear(loadWithholdingPayments(), calendarYear);
  const byPayee = new Map<string, PaymentSlipRow>();
  for (const p of payments) {
    const amounts = resolvePaymentAmounts(p);
    const cur = byPayee.get(p.payee_name) ?? {
      payee_name: p.payee_name,
      payment_count: 0,
      gross_yen: 0,
      withholding_yen: 0,
    };
    cur.payment_count += 1;
    cur.gross_yen += p.gross_yen;
    cur.withholding_yen += amounts.withholding_yen;
    byPayee.set(p.payee_name, cur);
  }
  const rows = [...byPayee.values()].sort((a, b) =>
    a.payee_name.localeCompare(b.payee_name, "ja"),
  );
  const total_gross = rows.reduce((s, r) => s + r.gross_yen, 0);
  const total_withholding = rows.reduce((s, r) => s + r.withholding_yen, 0);

  const issues: string[] = [];
  let outsourcing_expense_yen = 0;
  let variance_vs_outsourcing_line: number | null = null;
  try {
    const kessan = buildBlueReturnKessan(calendarYear);
    const line = kessan.expense_lines.find((l) => l.label === "外注工賃");
    outsourcing_expense_yen = line?.amount_yen ?? 0;
    if (outsourcing_expense_yen > 0 || total_gross > 0) {
      variance_vs_outsourcing_line = total_gross - outsourcing_expense_yen;
      if (Math.abs(variance_vs_outsourcing_line) > 0) {
        issues.push(
          `外注工賃（決算 ${outsourcing_expense_yen}）と支払調書総額（${total_gross}）が不一致（差 ${variance_vs_outsourcing_line}）`,
        );
      }
    }
  } catch {
    /* sole-prop optional for corporate tenants */
  }

  const markdown = [
    `# 支払調書（報酬・料金等）ドラフト — ${calendarYear}年分`,
    "",
    "法定調書の提出 XML / e-Tax ではない。税理士転記用。",
    "",
    "| 支払先 | 件数 | 支払金額 | 源泉徴収税額 |",
    "|--------|-----:|--------:|------------:|",
    ...rows.map(
      (r) =>
        `| ${r.payee_name} | ${r.payment_count} | ${r.gross_yen.toLocaleString("ja-JP")} | ${r.withholding_yen.toLocaleString("ja-JP")} |`,
    ),
    `| **合計** | ${payments.length} | **${total_gross.toLocaleString("ja-JP")}** | **${total_withholding.toLocaleString("ja-JP")}** |`,
    "",
    ...(issues.length ? ["## 突合", ...issues.map((i) => `- ${i}`)] : []),
  ].join("\n");

  return {
    rows,
    total_gross,
    total_withholding,
    markdown,
    outsourcing_expense_yen,
    variance_vs_outsourcing_line,
    issues,
  };
}

export function writePaymentSlipsDraft(calendarYear: number): {
  path: string;
  draft: ReturnType<typeof buildPaymentSlipsDraft>;
} {
  const draft = buildPaymentSlipsDraft(calendarYear);
  const dir = join(getDocsDir(), "finance", "tax", "withholding", String(calendarYear));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "payment-slips-draft.md");
  writeTrackedFile(path, draft.markdown);
  return { path, draft };
}
