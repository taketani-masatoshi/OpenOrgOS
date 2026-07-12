import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { BankAccountsFile } from "../../schemas/classification.js";
import {
  loadBankAccounts,
  loadClassificationRegistry,
  checkAgentAccess,
} from "./classification.js";
import { loadStakeholders } from "./data.js";
import { getStakeholdersYaml, SCRATCH_DIR, formatCurrency } from "./utils.js";

export type BrokerDisplayMode = "redacted" | "full";

export interface BankAccountView {
  id: string;
  bank: string;
  branch: string;
  account_type: string;
  holder: string;
  purpose?: string;
  account_number_display: string;
  branch_code_display?: string;
}

function maskAccountNumber(num: string): string {
  if (num === "REPLACE_ME" || num.length < 4) return "****";
  return "*".repeat(Math.max(0, num.length - 4)) + num.slice(-4);
}

export function getBankAccountView(
  banks: BankAccountsFile,
  id: string,
  mode: BrokerDisplayMode
): BankAccountView | undefined {
  const acct = banks.accounts.find((a) => a.id === id);
  if (!acct) return undefined;
  const redacted = mode === "redacted";
  return {
    id: acct.id,
    bank: acct.bank,
    branch: acct.branch.startsWith("REPLACE") ? "（支店 TBD）" : acct.branch,
    account_type: acct.account_type,
    holder: acct.holder,
    purpose: acct.purpose,
    account_number_display: redacted ? maskAccountNumber(acct.account_number) : acct.account_number,
    branch_code_display: redacted
      ? acct.branch_code?.startsWith("REPLACE")
        ? "****"
        : maskAccountNumber(acct.branch_code ?? "****")
      : acct.branch_code,
  };
}

export interface TransferInstruction {
  from_account_id: string;
  from_bank: string;
  from_branch: string;
  from_number_redacted: string;
  amount_yen: number;
  payee: string;
  reference: string;
  payee_bank_hint?: string;
  payee_email_hint?: string;
  dry_run: boolean;
  note: string;
}

export interface TransferOptions {
  from: string;
  amount: number;
  payee: string;
  reference: string;
  stakeholderId?: string;
  dryRun?: boolean;
  agent?: "finance" | "secretary" | "executive_steward";
}

export function buildTransferInstruction(opts: TransferOptions): TransferInstruction {
  const reg = loadClassificationRegistry();
  const agent = opts.agent ?? "finance";
  const access = checkAgentAccess(reg, agent, "data/finance/bank-accounts.yaml", "read");
  if (!access.allowed) {
    throw new Error(`Broker: ${access.reason}`);
  }

  const banks = loadBankAccounts();
  if (!banks) {
    throw new Error("bank-accounts.yaml 未作成 — cp bank-accounts.yaml.example bank-accounts.yaml");
  }

  const fromView = getBankAccountView(banks, opts.from, "redacted");
  if (!fromView) {
    throw new Error(`口座 ${opts.from} が bank-accounts.yaml にありません`);
  }

  let payeeBankHint: string | undefined;
  let payeeEmailHint: string | undefined;
  if (opts.stakeholderId && existsSync(getStakeholdersYaml())) {
    try {
      const stk = loadStakeholders();
      const entry = stk.stakeholders.find((s) => s.id === opts.stakeholderId);
      if (entry) {
        payeeEmailHint = entry.contact?.email ?? undefined;
        payeeBankHint = entry.org ?? entry.name;
      }
    } catch {
      /* stakeholders optional */
    }
  }

  return {
    from_account_id: fromView.id,
    from_bank: fromView.bank,
    from_branch: fromView.branch,
    from_number_redacted: fromView.account_number_display,
    amount_yen: opts.amount,
    payee: opts.payee,
    reference: opts.reference,
    payee_bank_hint: payeeBankHint,
    payee_email_hint: payeeEmailHint,
    dry_run: opts.dryRun ?? true,
    note: "口座番号の全文は bank-accounts.yaml（L2）· ネットバンキングで手入力。本指示は L1 サマリのみ。",
  };
}

export function formatTransferMarkdown(instr: TransferInstruction): string {
  const lines = [
    `# 振込指示（Broker · ${instr.dry_run ? "DRY-RUN" : "CONFIRMED"}）`,
    "",
    "| 項目 | 値 |",
    "|------|-----|",
    `| 出金口座 | ${instr.from_account_id} ${instr.from_bank} ${instr.from_branch} |`,
    `| 口座番号 | ${instr.from_number_redacted}（マスク） |`,
    `| 金額 | ${formatCurrency(instr.amount_yen)} |`,
    `| 振込先 | ${instr.payee} |`,
    `| 摘要 | ${instr.reference} |`,
  ];
  if (instr.payee_email_hint) {
    lines.push(`| 連絡先候補 | ${instr.payee_email_hint} |`);
  }
  lines.push("", `> ${instr.note}`, "");
  return lines.join("\n");
}

/** gitignore 配下 scratch/broker/ に L1 指示書を保存（口座全文なし） */
export function writeTransferInstructionFile(
  instr: TransferInstruction,
  filename?: string
): string {
  const dir = join(SCRATCH_DIR, "broker");
  mkdirSync(dir, { recursive: true });
  const name = filename ?? `transfer-${instr.from_account_id}-${instr.amount_yen}-${Date.now()}.md`;
  const path = join(dir, name);
  writeFileSync(path, formatTransferMarkdown(instr), "utf-8");
  return path;
}

export function formatBankList(mode: BrokerDisplayMode): string {
  const banks = loadBankAccounts();
  if (!banks) return "bank-accounts.yaml 未作成";
  const rows = banks.accounts.map((a) => {
    const v = getBankAccountView(banks, a.id, mode)!;
    return `| ${v.id} | ${v.bank} | ${v.branch} | ${v.account_number_display} | ${v.purpose ?? "—"} |`;
  });
  return [
    `# 法人口座一覧（${mode === "redacted" ? "マスク" : "FULL — ターミナルのみ"}）`,
    "",
    "| ID | 銀行 | 支店 | 口座番号 | 用途 |",
    "|----|------|------|----------|------|",
    ...rows,
    "",
    mode === "full"
      ? "⚠ L2 全文表示 — チャット・docs へ転記禁止"
      : "口座全文: bank-accounts.yaml · `steward broker bank --id BANK-001 --mode full`（ターミナルのみ）",
    "",
  ].join("\n");
}
