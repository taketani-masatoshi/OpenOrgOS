/**
 * Deterministic cash-balance view for CLI / Steward (L1 only — bank_account_id, no account numbers).
 */
import { loadCashBalance, resolveCashBalanceTotal, loadCompany } from "./data.js";
import type { CashBalance } from "../../schemas/finance.js";
import { formatCurrency } from "./utils.js";

export interface CashBalanceView {
  company_name: string;
  path: string;
  as_of: string | null;
  status: string | null;
  currency: string;
  total: number | null;
  accounts: Array<{ bank_account_id: string; amount: number | null }>;
  notes: string[];
  missing: boolean;
}

export function buildCashBalanceView(
  balance?: CashBalance | undefined
): CashBalanceView {
  const company = loadCompany();
  const data = balance === undefined ? loadCashBalance() : balance;
  if (!data) {
    return {
      company_name: company.name,
      path: "data/finance/cash-balance.yaml",
      as_of: null,
      status: null,
      currency: "JPY",
      total: null,
      accounts: [],
      notes: ["cash-balance.yaml がありません"],
      missing: true,
    };
  }
  const total = resolveCashBalanceTotal(data);
  const notes: string[] = [];
  if (data.notes) {
    notes.push(
      ...String(data.notes)
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 4)
    );
  }
  if (data.status !== "confirmed") {
    notes.push(`status=${data.status ?? "unknown"} — runway 算出には confirmed が必要`);
  }
  if (total == null) {
    notes.push("total / accounts の金額が未確定です");
  }
  return {
    company_name: company.name,
    path: "data/finance/cash-balance.yaml",
    as_of: data.as_of ?? null,
    status: data.status ?? null,
    currency: data.currency ?? "JPY",
    total,
    accounts: (data.accounts ?? [])
      .filter((a): a is typeof a & { bank_account_id: string } => Boolean(a.bank_account_id))
      .map((a) => ({
        bank_account_id: a.bank_account_id,
        amount: a.amount ?? null,
      })),
    notes,
    missing: false,
  };
}

export function formatCashBalanceMarkdown(view: CashBalanceView): string {
  const lines = [
    `# 現預金 — ${view.company_name}`,
    "",
    `**Path:** \`${view.path}\``,
    `**as_of:** ${view.as_of ?? "未設定"}`,
    `**status:** ${view.status ?? "未設定"}`,
    `**通貨:** ${view.currency}`,
    `**合計:** ${view.total == null ? "未確定" : formatCurrency(view.total)}`,
    "",
  ];
  if (view.missing) {
    lines.push("**未確認:** ファイルがありません。数値は捏造しません。");
    return lines.join("\n");
  }
  if (view.accounts.length > 0) {
    lines.push("## 口座別（bank_account_id のみ · L1）", "");
    lines.push("| bank_account_id | 残高 |");
    lines.push("|---|---:|");
    for (const a of view.accounts) {
      lines.push(
        `| ${a.bank_account_id} | ${a.amount == null ? "未設定" : formatCurrency(a.amount)} |`
      );
    }
    lines.push("");
  }
  if (view.notes.length > 0) {
    lines.push("## 注記", ...view.notes.map((n) => `- ${n}`), "");
  }
  lines.push(
    "口座番号は出しません（`bank-accounts.yaml` · L2）。",
    "",
    "```bash",
    "npm run orgos -- finances cash-balance",
    "npm run orgos -- cash-balance",
    "```"
  );
  return lines.join("\n");
}
