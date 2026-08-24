import {
  buildTransferInstruction,
  formatBankList,
  formatTransferMarkdown,
  writeTransferInstructionFile,
  getBankAccountView,
} from "../lib/broker.js";
import { loadBankAccounts } from "../lib/classification.js";
import type { BrokerDisplayMode } from "../lib/broker.js";
import { auditCliMutation, requireCliOperator } from "../lib/console-auth/cli-operator.js";
import { findOrgApproval } from "../lib/org/approval/approve.js";
import { amountRequiresSettlementStepUp } from "../lib/org/settlement-stepup.js";

export function runBrokerBankList(opts: { mode: BrokerDisplayMode }): void {
  console.log(formatBankList(opts.mode));
}

export function runBrokerBankShow(opts: { id: string; mode: BrokerDisplayMode }): void {
  const banks = loadBankAccounts();
  if (!banks) {
    console.error("bank-accounts.yaml 未作成");
    process.exit(1);
  }
  const view = getBankAccountView(banks, opts.id, opts.mode);
  if (!view) {
    console.error(`口座 ${opts.id} なし`);
    process.exit(1);
  }
  console.log(JSON.stringify(view, null, 2));
  if (opts.mode === "full") {
    console.error("\n⚠ L2 全文 — チャット・Git へ転記禁止");
  }
}

export function runBrokerTransfer(opts: {
  from: string;
  amount: number;
  payee: string;
  reference: string;
  stakeholderId?: string;
  dryRun: boolean;
  write: boolean;
  approvalId?: string;
}): void {
  requireCliOperator({ permission: "broker:transfer", command: "broker transfer" });

  if (opts.write && amountRequiresSettlementStepUp(opts.amount)) {
    const approvalId = opts.approvalId?.trim();
    if (!approvalId) {
      console.error(
        "金額が REG-004 tier B/C です。--write には --approval-id APR-... が必要です" +
          "（settlement PassKey step-up 済みの承認）。"
      );
      process.exit(1);
    }
    const approval = findOrgApproval(approvalId);
    if (!approval || (approval.status !== "approved" && approval.status !== "completed")) {
      console.error(`承認 ${approvalId} が見つからないか、未承認です`);
      process.exit(1);
    }
    if (!approval.amount || approval.amount.value < opts.amount) {
      console.error(
        `承認 ${approvalId} の金額が振込額をカバーしていません（承認額を確認）`
      );
      process.exit(1);
    }
    if (!approval.approver_id) {
      console.error(`承認 ${approvalId} に approver がありません`);
      process.exit(1);
    }
  }

  const instr = buildTransferInstruction({
    from: opts.from,
    amount: opts.amount,
    payee: opts.payee,
    reference: opts.reference,
    stakeholderId: opts.stakeholderId,
    dryRun: opts.dryRun,
  });

  console.log(formatTransferMarkdown(instr));

  if (opts.write) {
    const path = writeTransferInstructionFile(instr);
    console.log(`\n✓ 指示書（L1 · scratch/gitignore）: ${path}`);
    if (opts.approvalId) {
      console.log(`  approval: ${opts.approvalId}`);
    }
    auditCliMutation("broker transfer", `write:${path}`);
  }

  console.log("\n次: ネットバンキングで口座番号を bank-accounts.yaml から手入力");
}
