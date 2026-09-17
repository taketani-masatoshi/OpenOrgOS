/**
 * Console surfaces for contract portfolio, hospitality ops-due, property ops, and module maturity (L1).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { buildContractStatusView } from "../../contract-status-view.js";
import { buildModuleMaturityPanel } from "../../module-maturity/build-panel.js";
import { buildPropertyOpsDashboard } from "../../property-ops/build-dashboard.js";
import { buildWireDemoWalkthrough } from "../../wire-demo/build-walkthrough.js";
import {
  hospitalityModuleEnabled,
  listHospitalityOpsDue,
  loadStays,
} from "../../../../steward/modules/hospitality/cli/ops-lib.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/**
 * GET /chat/v1/contracts/status
 * GET /chat/v1/hospitality/ops-due
 * GET /chat/v1/properties/ops
 * GET /chat/v1/modules/maturity
 * GET /chat/v1/wire/demo
 */
export async function handleDomainOpsApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  if (pathname === "/chat/v1/contracts/status" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const horizonRaw = url.searchParams.get("horizon_days");
      const horizonDays = horizonRaw ? Number(horizonRaw) : undefined;
      json(res, 200, {
        ok: true,
        ...buildContractStatusView({
          horizonDays:
            horizonDays != null && Number.isFinite(horizonDays)
              ? horizonDays
              : undefined,
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

  if (pathname === "/chat/v1/hospitality/ops-due" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const today = url.searchParams.get("today") ?? undefined;
      const enabled = hospitalityModuleEnabled();
      json(res, 200, {
        ok: true,
        module_enabled: enabled,
        stay_count: enabled ? loadStays().stays.length : 0,
        due: enabled
          ? today
            ? listHospitalityOpsDue(today)
            : listHospitalityOpsDue()
          : [],
      });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/properties/ops" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const propertyId = url.searchParams.get("property_id") ?? undefined;
      const today = url.searchParams.get("today") ?? undefined;
      json(res, 200, buildPropertyOpsDashboard({ propertyId, today }));
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/modules/maturity" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    try {
      json(res, 200, buildModuleMaturityPanel());
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/wire/demo" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    try {
      json(res, 200, buildWireDemoWalkthrough());
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
