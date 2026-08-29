import type { IncomingMessage, ServerResponse } from "node:http";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import {
  requireBudgetSurfacePermission,
  resolveBudgetActor,
} from "../../console-auth/surface-guard.js";
import { readJsonLimited } from "../../http/read-json-limited.js";
import { appendChatAudit } from "../audit.js";
import { buildLedgerWorkbench } from "../../finance/ledger/workbench.js";
import { reverseJournalEntry } from "../../finance/journal-reverse.js";
import { appendJournalEntry } from "../../finance/expense-claim-journal.js";
import { lockMonth, unlockMonth } from "../../finance/period-lock.js";
import { postDepreciationJournalEntries } from "../../finance/depreciation.js";
import {
  postApPaymentJournalEntry,
  postArReceiptJournalEntry,
  postMonthlyPlJournalEntries,
  postPayrollPaymentJournalEntry,
  postRemittanceJournalEntry,
  type RemittanceObligation,
} from "../../finance/journal-sources.js";
import { resolveRemittanceFromCalendarRow } from "../../finance/remittance-from-calendar.js";
import { applyApprovedBankReconciliation, applyExactBankReconciliations } from "../../finance/bank-reconcile-apply.js";
import {
  decodeBankCsvBase64,
  importBankStatementCsvText,
  readBankCsvTemplateText,
} from "../../finance/bank-statement-import-service.js";
import {
  listBankCsvPresets,
  mappingForPresetOrGuess,
} from "../../finance/bank-csv-presets.js";
import { buildDenchoSkuSnapshot } from "../../product/dencho-premium-sku.js";
import { postFirstOnboardingJournal } from "../../product/ledger-first-journal.js";
import { buildMonthCloseChecklist } from "../../product/ledger-month-close-checklist.js";
import {
  listLedgerAccountsForUi,
  postManualJournalEntry,
} from "../../product/ledger-manual-entry.js";
import {
  approveJournalProposal,
  enqueueManualJournalProposal,
  listJournalProposals,
  listPendingJournalProposals,
  rejectJournalProposal,
} from "../../product/ledger-proposal-queue.js";
import {
  renderLedgerExportHttp,
  type LedgerExportTemplate,
} from "../../finance/ledger/journal-export.js";
import {
  buildElectronicLedgerComplianceReport,
  searchElectronicLedger,
} from "../../finance/ledger/electronic-ledger.js";
import { assertLedgerJournalPostAllowed } from "../../product/ledger-usage.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sanitizeLedgerEntryId(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9-]/g, "-").slice(0, 80);
}

/**
 * GET  /chat/v1/ledger/workbench | /export | /dencho/search | /dencho/check
 * POST /chat/v1/ledger/reverse | /period | /remittance | /post | /settle | /bank-reconcile
 *      | /bank-statements/import | /bank-reconcile/bulk-exact
 * Permission for writes: finance:reconcile
 */
export async function handleLedgerApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  if (!pathname.startsWith("/chat/v1/ledger/")) return false;

  if (pathname === "/chat/v1/ledger/workbench" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    const url = new URL(req.url ?? "/", "http://localhost");
    const asOf = url.searchParams.get("as_of") ?? undefined;
    json(res, 200, buildLedgerWorkbench({ asOf }));
    return true;
  }

  if (pathname === "/chat/v1/ledger/export" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    const url = new URL(req.url ?? "/", "http://localhost");
    const templateRaw = url.searchParams.get("template") ?? "journal-csv";
    const template: LedgerExportTemplate =
      templateRaw === "trial-balance-csv"
        ? "trial-balance-csv"
        : templateRaw === "account-breakdown-csv"
          ? "account-breakdown-csv"
          : templateRaw === "cash-flow-csv"
            ? "cash-flow-csv"
            : "journal-csv";
    const asOf = url.searchParams.get("as_of") ?? undefined;
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    const accountCode = url.searchParams.get("account") ?? undefined;
    const sourceKind = url.searchParams.get("source") ?? undefined;
    try {
      const rendered = renderLedgerExportHttp({
        template,
        asOf,
        from,
        to,
        accountCode,
        sourceKind,
      });
      res.writeHead(200, {
        "Content-Type": rendered.contentType,
        "Content-Disposition": `attachment; filename="${rendered.filename}"`,
      });
      res.end(rendered.content);
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/ledger/dencho/search" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    const url = new URL(req.url ?? "/", "http://localhost");
    const minRaw = url.searchParams.get("min_amount");
    const maxRaw = url.searchParams.get("max_amount");
    const limitRaw = url.searchParams.get("limit");
    const hits = searchElectronicLedger({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      minAmountYen: minRaw != null ? Number(minRaw) : undefined,
      maxAmountYen: maxRaw != null ? Number(maxRaw) : undefined,
      counterpartyId: url.searchParams.get("counterparty") ?? undefined,
      accountCode: url.searchParams.get("account") ?? undefined,
      descriptionContains: url.searchParams.get("description") ?? undefined,
      entryId: url.searchParams.get("entry_id") ?? undefined,
      limit: limitRaw != null ? Number(limitRaw) : 200,
    });
    json(res, 200, { count: hits.length, hits });
    return true;
  }

  if (pathname === "/chat/v1/ledger/reverse" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "finance:reconcile", res)) return true;
    try {
      assertLedgerJournalPostAllowed();
      const body = (await readJsonLimited(req, 32 * 1024)) as Record<string, unknown>;
      const entryId = String(body.entry_id ?? "").trim();
      if (!entryId) {
        json(res, 422, { ok: false, error: "entry_id is required" });
        return true;
      }
      const actor = resolveBudgetActor(user);
      const reversal = reverseJournalEntry({
        entryId,
        authorizedBy: actor.operator_id,
        occurredAt:
          typeof body.occurred_at === "string" ? body.occurred_at : undefined,
      });
      const saved = appendJournalEntry(reversal, { postedBy: actor.operator_id });
      json(res, 200, { ok: true, entry_id: saved.entry_id });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/ledger/period" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "finance:reconcile", res)) return true;
    try {
      assertLedgerJournalPostAllowed();
      const body = (await readJsonLimited(req, 16 * 1024)) as Record<string, unknown>;
      const month = String(body.month ?? body.period ?? "").trim();
      const action = String(body.action ?? "").trim();
      const actor = resolveBudgetActor(user);
      if (!/^\d{4}-\d{2}$/.test(month)) {
        json(res, 422, { ok: false, error: "month YYYY-MM is required" });
        return true;
      }
      if (action === "lock") {
        if (body.require_checklist === true || body.require_checklist === 1) {
          const checklist = buildMonthCloseChecklist(month);
          if (!checklist.ready) {
            json(res, 422, {
              ok: false,
              error: "month-close checklist not ready",
              checklist,
            });
            return true;
          }
        }
        lockMonth({
          month,
          lockedBy: actor.operator_id,
          reason: typeof body.reason === "string" ? body.reason : undefined,
        });
        appendChatAudit({
          action: "ledger_period_lock",
          operator_id: user.operator_id,
          approver_id: user.approver_id,
          ok: true,
          path: pathname,
          detail: month,
        });
        json(res, 200, { ok: true, month, status: "locked" });
        return true;
      }
      if (action === "unlock") {
        const reason = String(body.reason ?? "").trim();
        if (!reason) {
          json(res, 422, { ok: false, error: "reason is required to unlock" });
          return true;
        }
        unlockMonth({
          month,
          unlockedBy: actor.operator_id,
          reason,
        });
        appendChatAudit({
          action: "ledger_period_unlock",
          operator_id: user.operator_id,
          approver_id: user.approver_id,
          ok: true,
          path: pathname,
          detail: `${month}: ${reason}`,
        });
        json(res, 200, { ok: true, month, status: "unlocked" });
        return true;
      }
      json(res, 422, { ok: false, error: "action must be lock | unlock" });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/ledger/remittance" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "finance:reconcile", res)) return true;
    try {
      const body = (await readJsonLimited(req, 16 * 1024)) as Record<string, unknown>;
      const actor = resolveBudgetActor(user);
      let period = String(body.period ?? body.month ?? "").trim();
      let obligation = String(body.obligation ?? "").trim() as RemittanceObligation | "";
      const fromCalendar = String(body.from_calendar ?? "").trim();
      if (fromCalendar) {
        const resolved = resolveRemittanceFromCalendarRow({ rowId: fromCalendar });
        period = period || resolved.period;
        obligation = obligation || resolved.obligation;
      }
      if (!/^\d{4}-\d{2}$/.test(period)) {
        json(res, 422, { ok: false, error: "period YYYY-MM is required" });
        return true;
      }
      if (
        obligation !== "withholding" &&
        obligation !== "social_insurance" &&
        obligation !== "consumption_tax"
      ) {
        json(res, 422, {
          ok: false,
          error: "obligation must be withholding | social_insurance | consumption_tax",
        });
        return true;
      }
      const posted = postRemittanceJournalEntry({
        period,
        obligation,
        authorizedBy: actor.operator_id,
      });
      json(res, 200, {
        ok: true,
        entry_id: posted,
        settled: Boolean(posted),
        period,
        obligation,
      });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/ledger/post" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "finance:reconcile", res)) return true;
    try {
      assertLedgerJournalPostAllowed();
      const body = (await readJsonLimited(req, 16 * 1024)) as Record<string, unknown>;
      const source = String(body.source ?? "").trim();
      const month = String(body.month ?? body.period ?? "").trim();
      const actor = resolveBudgetActor(user);
      if (!/^\d{4}-\d{2}$/.test(month)) {
        json(res, 422, { ok: false, error: "month YYYY-MM is required" });
        return true;
      }
      if (source === "monthly-pl") {
        const dep = postDepreciationJournalEntries({
          period: month,
          authorizedBy: actor.operator_id,
        });
        const posted = postMonthlyPlJournalEntries({
          period: month,
          authorizedBy: actor.operator_id,
        });
        const entryIds = [...dep, ...posted];
        if (entryIds.length === 0) {
          json(res, 422, {
            ok: false,
            error: "no journal entries posted — monthly finances missing for this month",
            source,
            month,
            entry_ids: [],
          });
          return true;
        }
        json(res, 200, {
          ok: true,
          source,
          month,
          entry_ids: entryIds,
        });
        return true;
      }
      if (source === "payroll-payment") {
        const posted = postPayrollPaymentJournalEntry({
          period: month,
          authorizedBy: actor.operator_id,
        });
        if (!posted) {
          json(res, 422, {
            ok: false,
            error: "no journal entries posted — payroll payment not settled",
            source,
            month,
          });
          return true;
        }
        json(res, 200, {
          ok: true,
          source,
          month,
          entry_id: posted,
          settled: true,
        });
        return true;
      }
      if (source === "onboarding-first") {
        const posted = postFirstOnboardingJournal({
          authorizedBy: actor.operator_id,
          force: Boolean(body.force),
        });
        if (posted.skipped || !posted.entry_id) {
          json(res, 422, {
            ok: false,
            error:
              posted.reason ??
              "no journal entries posted — journals already present or seed failed",
            source,
            month,
            skipped: posted.skipped,
          });
          return true;
        }
        json(res, 200, {
          ok: true,
          source,
          month,
          entry_id: posted.entry_id,
          skipped: false,
        });
        return true;
      }
      json(res, 422, {
        ok: false,
        error: "source must be monthly-pl | payroll-payment | onboarding-first",
      });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/ledger/settle" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "finance:reconcile", res)) return true;
    try {
      assertLedgerJournalPostAllowed();
      const body = (await readJsonLimited(req, 16 * 1024)) as Record<string, unknown>;
      const kind = String(body.kind ?? "").trim();
      const counterparty = String(body.counterparty_id ?? body.counterparty ?? "").trim();
      const month = String(body.month ?? body.period ?? "").trim();
      const amountYen = Number(body.amount_yen ?? body.amount);
      const actor = resolveBudgetActor(user);
      if (kind !== "ar-receipt" && kind !== "ap-payment") {
        json(res, 422, { ok: false, error: "kind must be ar-receipt | ap-payment" });
        return true;
      }
      if (!counterparty) {
        json(res, 422, { ok: false, error: "counterparty_id is required" });
        return true;
      }
      if (!/^\d{4}-\d{2}$/.test(month)) {
        json(res, 422, { ok: false, error: "month YYYY-MM is required" });
        return true;
      }
      if (!Number.isFinite(amountYen) || amountYen <= 0) {
        json(res, 422, { ok: false, error: "amount_yen must be positive" });
        return true;
      }
      const stamp = month.replace(/-/g, "");
      const ledgerEntryId = sanitizeLedgerEntryId(
        `${kind === "ar-receipt" ? "AR" : "AP"}-${counterparty}-${stamp}-${amountYen}`,
      );
      const occurredAt =
        typeof body.occurred_at === "string"
          ? body.occurred_at
          : `${month}-28T12:00:00.000Z`;
      const posted =
        kind === "ar-receipt"
          ? postArReceiptJournalEntry({
              ledgerEntryId,
              amountYen,
              counterpartyId: counterparty,
              occurredAt,
              authorizedBy: actor.operator_id,
            })
          : postApPaymentJournalEntry({
              ledgerEntryId,
              amountYen,
              counterpartyId: counterparty,
              occurredAt,
              authorizedBy: actor.operator_id,
            });
      json(res, 200, { ok: true, entry_id: posted, kind, counterparty_id: counterparty });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/ledger/bank-reconcile" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "finance:reconcile", res)) return true;
    try {
      const body = (await readJsonLimited(req, 16 * 1024)) as Record<string, unknown>;
      const bankId = String(body.bank_id ?? body.bankId ?? "").trim();
      const arApId = String(body.ar_ap_id ?? body.arApId ?? "").trim();
      const amount = Number(body.amount_yen ?? body.amount);
      const reason = String(body.reason ?? "workbench-approved").trim();
      const actor = resolveBudgetActor(user);
      if (!bankId || !arApId) {
        json(res, 422, { ok: false, error: "bank_id and ar_ap_id are required" });
        return true;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        json(res, 422, { ok: false, error: "amount must be positive" });
        return true;
      }
      const result = applyApprovedBankReconciliation({
        bankId,
        arApId,
        amount,
        reason,
        authorizedBy: actor.operator_id,
        effectiveDate:
          typeof body.effective_date === "string" ? body.effective_date : undefined,
      });
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/ledger/bank-statements/import" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "finance:reconcile", res)) return true;
    try {
      const body = (await readJsonLimited(req, 2 * 1024 * 1024)) as {
        csv_text?: string;
        csv_base64?: string;
        encoding?: "utf-8" | "shift_jis" | "auto";
        write?: boolean;
        dry_run?: boolean;
        opening_balance?: number;
        closing_balance?: number;
        preset?: string;
        /** Only used when preset is absent — preset always wins when set. */
        column_mapping?: {
          date: string;
          amount: string;
          description: string;
          direction?: string;
          signed_amount?: string;
          withdrawal_amount?: string;
          deposit_amount?: string;
          category?: string;
          account_id?: string;
          reference?: string;
          counterparty?: string;
        };
      };
      let csvText = body.csv_text?.trim() ?? "";
      let encoding_used: "utf-8" | "shift_jis" | undefined;
      if (!csvText && body.csv_base64) {
        const decoded = decodeBankCsvBase64(
          body.csv_base64,
          body.encoding ?? "auto",
        );
        csvText = decoded.text.trim();
        encoding_used = decoded.encoding_used;
      } else if (csvText && body.encoding === "shift_jis") {
        /* text already decoded client-side */
      }
      if (!csvText) {
        json(res, 422, { ok: false, error: "csv_text or csv_base64 required" });
        return true;
      }
      // Preset-preferred mapping: ignore client column_mapping when preset is set
      // (bank-preset-no-override).
      const columnMapping = body.preset
        ? mappingForPresetOrGuess(body.preset, csvText)
        : body.column_mapping ?? mappingForPresetOrGuess(undefined, csvText);
      const dryRun = body.dry_run === true || body.write === false;
      const result = importBankStatementCsvText({
        csvText,
        write: !dryRun,
        dry_run: dryRun,
        openingBalance: body.opening_balance,
        closingBalance: body.closing_balance,
        columnMapping,
      });
      json(res, 200, { ok: true, encoding_used, ...result });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/ledger/bank-reconcile/bulk-exact" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "finance:reconcile", res)) return true;
    try {
      const actor = resolveBudgetActor(user);
      const result = applyExactBankReconciliations({
        authorizedBy: actor.operator_id,
      });
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/ledger/dencho/sku" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, { ok: true, ...buildDenchoSkuSnapshot() });
    return true;
  }

  if (pathname === "/chat/v1/ledger/dencho/check" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    try {
      json(res, 200, { ok: true, ...buildElectronicLedgerComplianceReport() });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/ledger/month-close-checklist" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    const url = new URL(req.url ?? "/", "http://localhost");
    const month = url.searchParams.get("month") ?? undefined;
    json(res, 200, { ok: true, checklist: buildMonthCloseChecklist(month ?? undefined) });
    return true;
  }

  if (pathname === "/chat/v1/ledger/accounts" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, { ok: true, accounts: listLedgerAccountsForUi() });
    return true;
  }

  if (pathname === "/chat/v1/ledger/manual-entry" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "finance:reconcile", res)) return true;
    try {
      assertLedgerJournalPostAllowed();
      const body = (await readJsonLimited(req, 32 * 1024)) as Record<string, unknown>;
      const actor = resolveBudgetActor(user);
      const posted = postManualJournalEntry({
        description: String(body.description ?? ""),
        occurredAt:
          typeof body.occurred_at === "string" ? body.occurred_at : undefined,
        debitAccount: String(body.debit_account ?? body.debitAccount ?? ""),
        creditAccount: String(body.credit_account ?? body.creditAccount ?? ""),
        amountYen: Number(body.amount_yen ?? body.amount),
        authorizedBy: actor.operator_id,
      });
      json(res, 200, { ok: true, ...posted });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/ledger/bank-csv-template" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    const url = new URL(req.url ?? "/", "http://localhost");
    const presetParam = url.searchParams.get("preset") ?? undefined;
    const csv = readBankCsvTemplateText();
    const mapping = mappingForPresetOrGuess(presetParam, csv);
    const presets = listBankCsvPresets().map((p) => ({ id: p.id, label: p.label }));
    json(res, 200, {
      ok: true,
      filename: "bank-csv-template.csv",
      csv_text: csv,
      suggested_mapping: mapping,
      presets,
      preset: presetParam ?? "generic",
    });
    return true;
  }

  if (pathname === "/chat/v1/ledger/proposals" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, {
      ok: true,
      pending: listPendingJournalProposals(),
      proposals: listJournalProposals(),
    });
    return true;
  }

  if (pathname === "/chat/v1/ledger/proposals" && method === "POST") {
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    try {
      const body = (await readJsonLimited(req, 32 * 1024)) as Record<string, unknown>;
      const proposal = enqueueManualJournalProposal({
        description: String(body.description ?? ""),
        debitAccount: String(body.debit_account ?? body.debitAccount ?? ""),
        creditAccount: String(body.credit_account ?? body.creditAccount ?? ""),
        amountYen: Number(body.amount_yen ?? body.amount),
        occurredAt:
          typeof body.occurred_at === "string" ? body.occurred_at : undefined,
        source: body.source === "chat" || body.source === "ui" ? body.source : "mcp",
        note: typeof body.note === "string" ? body.note : undefined,
      });
      json(res, 200, { ok: true, proposal });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/ledger/proposals/approve" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "finance:reconcile", res)) return true;
    try {
      assertLedgerJournalPostAllowed();
      const body = (await readJsonLimited(req, 16 * 1024)) as Record<string, unknown>;
      const actor = resolveBudgetActor(user);
      const result = approveJournalProposal({
        proposalId: String(body.proposal_id ?? body.proposalId ?? ""),
        authorizedBy: actor.operator_id,
      });
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/ledger/proposals/reject" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "finance:reconcile", res)) return true;
    try {
      const body = (await readJsonLimited(req, 16 * 1024)) as Record<string, unknown>;
      const proposal = rejectJournalProposal(
        String(body.proposal_id ?? body.proposalId ?? ""),
      );
      json(res, 200, { ok: true, proposal });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  return false;
}
