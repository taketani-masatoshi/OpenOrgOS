import type { IncomingMessage, ServerResponse } from "node:http";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { isMedicalDeviceModuleEnabled } from "../../medical-device/compliance-signals.js";
import { buildQmsPortfolio, listQmsDecisions } from "../../medical-device/qms-portfolio.js";
import { buildGvpPortfolio, listGvpDecisions } from "../../medical-device/gvp-portfolio.js";
import { collectMedicalDeviceDeadlines } from "../../medical-device/deadlines.js";
import { collectMedicalDeviceIntegrityIssues } from "../../medical-device/integrity.js";
import { listMedicalDeviceAudit } from "../../medical-device/audit.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/**
 * GET /chat/v1/compliance/medical-device — read-only projection of the QMS / GVP
 * operational ledgers, their deadlines and the decisions awaiting an approver.
 *
 * Ledger writes stay on the CLI + org approval path: a regulated ledger must not
 * gain a second, unaudited mutation surface.
 */
export async function handleMedicalDeviceApi(
  _req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser
): Promise<boolean> {
  if (pathname !== "/chat/v1/compliance/medical-device") return false;
  if (method !== "GET") {
    json(res, 405, { ok: false, error: "read_only_surface" });
    return true;
  }
  if (!requireChatPermission(user, "chat:read", res)) return true;

  if (!isMedicalDeviceModuleEnabled()) {
    json(res, 200, { ok: true, enabled: false });
    return true;
  }

  // The portfolios are projected from tenant YAML, which can be malformed by
  // hand. A regulated read surface must answer, not take the process down.
  try {
    const qms = buildQmsPortfolio();
    const gvp = buildGvpPortfolio();
    json(res, 200, {
      ok: true,
      enabled: true,
      qms,
      gvp,
      decisions: [...listQmsDecisions(qms), ...listGvpDecisions(gvp)],
      deadlines: collectMedicalDeviceDeadlines(),
      integrity_issues: collectMedicalDeviceIntegrityIssues(),
      audit: listMedicalDeviceAudit({ limit: 20 }),
    });
  } catch (error) {
    json(res, 422, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return true;
}
