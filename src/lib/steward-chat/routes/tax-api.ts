/**
 * Tax module HTTP API — separated from Ledger accounting workbench.
 * Submission to e-Tax/eLTAX is never performed here (ADR 0052 Phase 5c).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { readJsonLimited } from "../../http/read-json-limited.js";
import { buildTaxReadinessReport } from "../../product/ledger-tax-readiness.js";
import { writeCorporateTaxXmlDraft } from "../../finance/jp-corporate-tax-xml.js";
import {
  buildTaxHandoffPackage,
  taxModuleBoundaryNote,
} from "../../tax/tax-handoff-package.js";
import {
  buildPayrollYearEndReadiness,
  computeBonusDraft,
  computeYearEndAdjustment,
  saveBonusDraft,
  markYearEndReadyForHandoff,
  postBonusDraftJournal,
  summarizeYearEndAdjustment,
} from "../../finance/payroll-bonus-yea.js";
import { resolveDefaultFiscalYear } from "../../finance/fiscal-year.js";
import {
  requireBudgetSurfacePermission,
  resolveBudgetActor,
} from "../../console-auth/surface-guard.js";
import { buildTaxCalendarPortfolio } from "../../finance/tax-calendar-portfolio.js";
import { summarizeTaxFilingGaps, tryLoadTaxFilingGaps } from "../../finance/tax-filing-gaps.js";
import { runConsumptionTaxCheck } from "../../finance/consumption-tax.js";
import { computePayrollMonth } from "../../finance/payroll-jp.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/**
 * GET  /chat/v1/tax/readiness | /handoff | /payroll-yea | /calendar | /gaps | /consumption
 * POST /chat/v1/tax/xml-draft | /handoff | /bonus-draft | /yea/ready | /yea/compute | /payroll-calc
 */
export async function handleTaxApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  if (!pathname.startsWith("/chat/v1/tax/")) return false;

  if (pathname === "/chat/v1/tax/readiness" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, {
      ok: true,
      ...buildTaxReadinessReport(),
      boundary: taxModuleBoundaryNote(),
    });
    return true;
  }

  if (pathname === "/chat/v1/tax/calendar" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const today = url.searchParams.get("today") ?? undefined;
      json(res, 200, { ok: true, ...buildTaxCalendarPortfolio({ today }) });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/tax/gaps" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, { ok: true, ...summarizeTaxFilingGaps(tryLoadTaxFilingGaps()) });
    return true;
  }

  if (pathname === "/chat/v1/tax/xml-draft" && method === "POST") {
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    try {
      const body = (await readJsonLimited(req)) as { fiscal_year?: string };
      const draft = writeCorporateTaxXmlDraft({
        fiscalYear: body.fiscal_year,
      });
      json(res, 200, { ok: true, ...draft });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/tax/handoff" && method === "POST") {
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    try {
      const body = (await readJsonLimited(req)) as { fiscal_year?: string };
      const pack = buildTaxHandoffPackage({ fiscalYear: body.fiscal_year });
      json(res, 200, { ok: true, ...pack });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/tax/handoff" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, {
      ok: true,
      boundary: taxModuleBoundaryNote(),
      readiness: buildTaxReadinessReport(),
      submission: "not-for-etax",
    });
    return true;
  }

  if (pathname === "/chat/v1/tax/payroll-yea" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    const fy = resolveDefaultFiscalYear();
    json(res, 200, { ok: true, ...buildPayrollYearEndReadiness(fy) });
    return true;
  }

  if (pathname === "/chat/v1/tax/bonus-draft" && method === "POST") {
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    try {
      const body = (await readJsonLimited(req)) as {
        period?: string;
        gross_yen?: number;
        employee_id?: string;
      };
      if (!body.period?.trim() || !Number.isFinite(body.gross_yen)) {
        json(res, 422, { ok: false, error: "period and gross_yen required" });
        return true;
      }
      const run = computeBonusDraft({
        period: body.period,
        grossYen: Number(body.gross_yen),
        employeeId: body.employee_id,
      });
      saveBonusDraft(run);
      json(res, 200, { ok: true, run });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/tax/bonus-post" && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "finance:reconcile", res)) return true;
    try {
      const body = (await readJsonLimited(req)) as { run_id?: string };
      if (!body.run_id?.trim()) {
        json(res, 422, { ok: false, error: "run_id required" });
        return true;
      }
      const actor = resolveBudgetActor(user);
      const posted = postBonusDraftJournal({
        runId: body.run_id.trim(),
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

  if (pathname === "/chat/v1/tax/yea/compute" && method === "POST") {
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    try {
      const body = (await readJsonLimited(req)) as { fiscal_year?: string };
      const fy = body.fiscal_year?.trim() || resolveDefaultFiscalYear();
      const yea = computeYearEndAdjustment(fy);
      json(res, 200, { ok: true, yea: summarizeYearEndAdjustment(yea) });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/tax/yea/ready" && method === "POST") {
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    try {
      const body = (await readJsonLimited(req)) as { fiscal_year?: string };
      const fy = body.fiscal_year?.trim() || resolveDefaultFiscalYear();
      const yea = markYearEndReadyForHandoff(fy);
      json(res, 200, { ok: true, yea: summarizeYearEndAdjustment(yea) });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/tax/consumption" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    try {
      json(res, 200, { ok: true, ...runConsumptionTaxCheck() });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/tax/payroll-calc" && method === "POST") {
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    try {
      const body = (await readJsonLimited(req)) as {
        month?: string;
        gross_yen?: number;
        dependents?: number;
      };
      const month = String(body.month ?? "").trim();
      const grossYen = Number(body.gross_yen);
      if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(grossYen) || grossYen < 0) {
        json(res, 422, { ok: false, error: "month YYYY-MM and gross_yen are required" });
        return true;
      }
      const dependents = Number(body.dependents ?? 0);
      json(res, 200, {
        ok: true,
        run: computePayrollMonth({
          month,
          grossYen,
          dependents: Number.isFinite(dependents) ? dependents : 0,
        }),
      });
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
