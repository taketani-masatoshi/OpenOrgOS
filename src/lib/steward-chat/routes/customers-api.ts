import type { IncomingMessage, ServerResponse } from "node:http";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import {
  CS_MODULE_ID,
  resolveCustomersNavGate,
  SALES_MODULE_ID,
} from "../../customers-nav-gate.js";
import { buildCustomerChurnView } from "../../customer-churn-view.js";
import { buildCustomerSuccessView } from "../../customer-success-view.js";
import { buildSalesInboundView } from "../../sales-inbound-view.js";
import { buildSalesOutboundView } from "../../sales-outbound-view.js";
import { buildSalesPipelineView } from "../../sales-pipeline-view.js";
import { buildSalesCrmDashboardView } from "../../sales-dashboard-view.js";
import { buildCustomersPipelineView } from "../../sales-pipeline-board-view.js";
import { buildCustomersAccountsView } from "../../sales-accounts-view.js";
import { isModuleEnabled } from "../../module-business-data.js";
import { readJsonLimited } from "../../http/read-json-limited.js";
import { setDealStage, setDealNextAction } from "../../sales-deal-service.js";
import { promoteInquiryToDeal } from "../../sales-handoff.js";
import type { SalesDealStage, SalesLostReason } from "../../../../schemas/sales.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function gatePayload() {
  return resolveCustomersNavGate();
}

function requireCustomersTab(user: WireConsoleUser, res: ServerResponse): boolean {
  if (!requireChatPermission(user, "chat:read", res)) return false;
  const gate = gatePayload();
  if (!gate.show_tab) {
    json(res, 403, {
      ok: false,
      error: "customers_tab_unavailable",
      gate,
    });
    return false;
  }
  return true;
}

function requireSalesPanel(user: WireConsoleUser, res: ServerResponse): boolean {
  if (!requireCustomersTab(user, res)) return false;
  const gate = gatePayload();
  if (!gate.sales_enabled && !gate.sales_agent_grace) {
    json(res, 200, {
      ok: true,
      locked: true,
      module_id: SALES_MODULE_ID,
      gate,
      message: "セールスモジュールを On にすると表示できます。",
    });
    return false;
  }
  return true;
}

function requireCsPanel(user: WireConsoleUser, res: ServerResponse): boolean {
  if (!requireCustomersTab(user, res)) return false;
  const gate = gatePayload();
  if (!gate.customer_success_enabled) {
    json(res, 200, {
      ok: true,
      locked: true,
      module_id: CS_MODULE_ID,
      gate,
      message: "カスタマーサクセスモジュールを On にすると表示できます。",
    });
    return false;
  }
  return true;
}

function operatorId(user: WireConsoleUser): string {
  return user.operator_id ?? "console";
}

/**
 * GET/POST /chat/v1/customers/*
 */
export async function handleCustomersApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  if (!pathname.startsWith("/chat/v1/customers")) return false;

  if (pathname === "/chat/v1/customers/nav") {
    if (method !== "GET") {
      json(res, 405, { ok: false, error: "method not allowed" });
      return true;
    }
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, { ok: true, ...gatePayload() });
    return true;
  }

  if (pathname === "/chat/v1/customers/crm-dashboard") {
    if (method !== "GET") {
      json(res, 405, { ok: false, error: "method not allowed" });
      return true;
    }
    if (!requireSalesPanel(user, res)) return true;
    json(res, 200, {
      ok: true,
      gate: gatePayload(),
      view: buildSalesCrmDashboardView(),
    });
    return true;
  }

  if (pathname === "/chat/v1/customers/pipeline") {
    if (method !== "GET") {
      json(res, 405, { ok: false, error: "method not allowed" });
      return true;
    }
    if (!requireSalesPanel(user, res)) return true;
    const { countAmbiguousMailLinks } = await import("../../sales-mail-link.js");
    json(res, 200, {
      ok: true,
      gate: gatePayload(),
      pipeline: buildCustomersPipelineView(),
      summary: buildSalesPipelineView({ includeDemo: false }),
      ambiguous_mail_count: countAmbiguousMailLinks(),
      mail_link_hint: "orgos sales mail-link-resolve --triage-id … --deal DEAL-…",
    });
    return true;
  }

  if (pathname === "/chat/v1/customers/accounts") {
    if (method !== "GET") {
      json(res, 405, { ok: false, error: "method not allowed" });
      return true;
    }
    if (!requireSalesPanel(user, res)) return true;
    json(res, 200, {
      ok: true,
      gate: gatePayload(),
      view: buildCustomersAccountsView(),
    });
    return true;
  }

  if (pathname === "/chat/v1/customers/deals/set-stage" && method === "POST") {
    if (!requireSalesPanel(user, res)) return true;
    try {
      const body = (await readJsonLimited(req, 16 * 1024)) as Record<string, unknown>;
      const stage = String(body.stage ?? "") as SalesDealStage;
      const needsApprove = stage === "won" || Boolean(body.reopen);
      if (!requireChatPermission(user, needsApprove ? "chat:approve" : "chat:ask", res)) {
        return true;
      }
      const deal = setDealStage({
        dealId: String(body.deal_id ?? body.dealId ?? ""),
        toStage: stage,
        lostReason: body.lost_reason as SalesLostReason | undefined,
        lostNotes: typeof body.lost_notes === "string" ? body.lost_notes : undefined,
        reopen: Boolean(body.reopen),
        actor: { operator_id: operatorId(user) },
      });
      json(res, 200, { ok: true, deal: { id: deal.id, stage: deal.stage } });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/customers/deals/set-next-action" && method === "POST") {
    if (!requireSalesPanel(user, res)) return true;
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    try {
      const body = (await readJsonLimited(req, 16 * 1024)) as Record<string, unknown>;
      const deal = setDealNextAction({
        dealId: String(body.deal_id ?? body.dealId ?? ""),
        next_action: String(body.next_action ?? body.nextAction ?? ""),
        next_action_due:
          typeof body.next_action_due === "string" ? body.next_action_due : undefined,
        actor: { operator_id: operatorId(user) },
      });
      json(res, 200, {
        ok: true,
        deal: {
          id: deal.id,
          next_action: deal.next_action,
          next_action_due: deal.next_action_due,
        },
      });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/customers/inquiry/promote" && method === "POST") {
    if (!requireSalesPanel(user, res)) return true;
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    try {
      const body = (await readJsonLimited(req, 16 * 1024)) as Record<string, unknown>;
      const result = promoteInquiryToDeal({
        inquiryId: String(body.inquiry_id ?? body.inquiryId ?? ""),
        title: typeof body.title === "string" ? body.title : undefined,
        actor: operatorId(user),
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

  if (method !== "GET") {
    json(res, 405, { ok: false, error: "method not allowed" });
    return true;
  }

  if (pathname === "/chat/v1/customers/outbound") {
    if (!requireSalesPanel(user, res)) return true;
    json(res, 200, {
      ok: true,
      gate: gatePayload(),
      outbound: buildSalesOutboundView({ includeDemo: false }),
      pipeline: buildSalesPipelineView({ includeDemo: false }),
    });
    return true;
  }

  if (pathname === "/chat/v1/customers/inbound") {
    if (!requireSalesPanel(user, res)) return true;
    const view = buildSalesInboundView({ includeDemo: false });
    const { loadSalesInquiries } = await import("../../data.js");
    const { countAmbiguousMailLinks } = await import("../../sales-mail-link.js");
    const qualified = (loadSalesInquiries()?.inquiries ?? [])
      .filter((i) => i.demo !== true && i.status === "qualified")
      .map((i) => ({
        id: i.id,
        subject: i.subject,
        company: i.company,
        status: i.status,
      }));
    json(res, 200, {
      ok: true,
      gate: gatePayload(),
      view,
      qualified_for_promote: qualified,
      ambiguous_mail_count: countAmbiguousMailLinks(),
      mail_link_hint: "orgos sales mail-link-resolve --triage-id … --deal DEAL-…",
    });
    return true;
  }

  if (pathname === "/chat/v1/customers/after-sales") {
    if (!requireCsPanel(user, res)) return true;
    json(res, 200, {
      ok: true,
      gate: gatePayload(),
      view: buildCustomerSuccessView({ includeDemo: false }),
    });
    return true;
  }

  if (pathname === "/chat/v1/customers/churn") {
    if (!requireCsPanel(user, res)) return true;
    json(res, 200, {
      ok: true,
      gate: gatePayload(),
      view: buildCustomerChurnView({ includeDemo: false }),
    });
    return true;
  }

  json(res, 404, { ok: false, error: "not found" });
  return true;
}

/** Used by tests — module enabled checks without HTTP. */
export { isModuleEnabled };
