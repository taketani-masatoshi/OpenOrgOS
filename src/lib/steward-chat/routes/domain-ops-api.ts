/**
 * Console surfaces for contract portfolio and hospitality ops-due (L1).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { buildContractStatusView } from "../../contract-status-view.js";
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

  return false;
}
