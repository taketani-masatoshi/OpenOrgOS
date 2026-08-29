/**
 * Broker transfer BFF — L1 only (bank_account_id + amount + payee).
 * Path: src/lib/steward-chat/routes/broker-api.ts
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireWireConsolePermission } from "../../console-auth/operator-rbac.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { appendChatAudit } from "../audit.js";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  readJsonLimited,
} from "../../http/read-json-limited.js";
import {
  buildTransferInstruction,
  formatTransferMarkdown,
  getBankAccountView,
  writeTransferInstructionFile,
} from "../../broker.js";
import { findOrgApproval } from "../../org/approval/approve.js";
import { amountRequiresSettlementStepUp } from "../../org/settlement-stepup.js";
import { loadBankAccounts } from "../../classification.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const transferBodySchema = z.object({
  from: z.string().min(1),
  amount: z.number().positive(),
  payee: z.string().min(1),
  reference: z.string().min(1),
  stakeholder_id: z.string().optional(),
  dry_run: z.boolean().optional(),
  write: z.boolean().optional(),
  approval_id: z.string().optional(),
});

export async function handleBrokerApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  if (pathname === "/chat/v1/broker/accounts" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    const banks = loadBankAccounts();
    const accounts = (banks?.accounts ?? []).map((a) => {
      const view = getBankAccountView(banks!, a.id, "redacted");
      return {
        id: a.id,
        bank: view?.bank ?? a.bank,
        branch: view?.branch,
        holder: view?.holder,
        purpose: view?.purpose,
        account_number_display: view?.account_number_display ?? "****",
      };
    });
    json(res, 200, { ok: true, accounts });
    return true;
  }

  if (pathname === "/chat/v1/broker/transfer" && method === "POST") {
    if (!requireWireConsolePermission(user, "broker:transfer", res)) return true;
    try {
      const raw = await readJsonLimited(req);
      const body = transferBodySchema.parse(raw);
      const write = body.write === true;
      const dryRun = body.dry_run !== false && !write;

      if (write && amountRequiresSettlementStepUp(body.amount)) {
        const approvalId = body.approval_id?.trim();
        if (!approvalId) {
          json(res, 422, {
            ok: false,
            error:
              "金額が REG-004 tier B/C です。write には approval_id（Settlement PassKey 済み）が必要です",
          });
          return true;
        }
        const approval = findOrgApproval(approvalId);
        if (!approval || (approval.status !== "approved" && approval.status !== "completed")) {
          json(res, 400, {
            ok: false,
            error: `承認 ${approvalId} が見つからないか、未承認です`,
          });
          return true;
        }
        if (!approval.amount || approval.amount.value < body.amount) {
          json(res, 400, {
            ok: false,
            error: `承認 ${approvalId} の金額が振込額をカバーしていません`,
          });
          return true;
        }
      }

      const instr = buildTransferInstruction({
        from: body.from,
        amount: body.amount,
        payee: body.payee,
        reference: body.reference,
        stakeholderId: body.stakeholder_id,
        dryRun,
      });
      const markdown = formatTransferMarkdown(instr);
      let path: string | undefined;
      if (write) {
        path = writeTransferInstructionFile({ ...instr, dry_run: false });
      }
      appendChatAudit({
        action: "broker_transfer",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: `${instr.from_account_id}:${instr.amount_yen}`,
      });
      json(res, 200, {
        ok: true,
        instruction: {
          from_account_id: instr.from_account_id,
          from_bank: instr.from_bank,
          from_branch: instr.from_branch,
          from_number_redacted: instr.from_number_redacted,
          amount_yen: instr.amount_yen,
          payee: instr.payee,
          reference: instr.reference,
          dry_run: instr.dry_run,
          note: instr.note,
        },
        markdown,
        path,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "broker_transfer",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      const status =
        err instanceof InvalidJsonError || err instanceof PayloadTooLargeError
          ? 400
          : err instanceof z.ZodError
            ? 422
            : 400;
      json(res, status, { ok: false, error: message });
    }
    return true;
  }

  return false;
}
