import type { IncomingMessage } from "node:http";
import { resolveTenantFromEnv } from "../orgos-cli.js";
import {
  isRequestTenantRequired,
  resolveTenantFromRequest,
} from "../product/ledger-control-plane.js";
import type { WireConsoleUser } from "../wire-console/auth/session.js";

export type SessionTenantMatch =
  | { ok: true; tenantId: string }
  | { ok: false; status: number; error: string };

/**
 * Resolve the tenant that login / auth must bind to.
 * Prefer explicit Host / X-OrgOS-Tenant, then ORGOS_TENANT.
 */
export function resolveLoginTenantId(req: IncomingMessage): string | null {
  return resolveTenantFromRequest(req);
}

/**
 * Authenticated request: session.tenant_id is authoritative.
 * A client header cannot elevate into another tenant.
 */
export function matchSessionTenant(
  user: WireConsoleUser,
  requestTenant: string | null,
): SessionTenantMatch {
  const sessionTenant = user.tenant_id?.trim().toLowerCase() || "";

  if (!sessionTenant) {
    if (isRequestTenantRequired()) {
      return {
        ok: false,
        status: 403,
        error: "session missing tenant_id — re-login required",
      };
    }
    const fallback =
      requestTenant ??
      (() => {
        try {
          return resolveTenantFromEnv() ?? null;
        } catch {
          return null;
        }
      })();
    if (!fallback) {
      return { ok: false, status: 400, error: "tenant required" };
    }
    return { ok: true, tenantId: fallback };
  }

  if (requestTenant && requestTenant !== sessionTenant) {
    return {
      ok: false,
      status: 403,
      error: "session tenant mismatch",
    };
  }

  if (isRequestTenantRequired() && !requestTenant) {
    return {
      ok: false,
      status: 400,
      error: "X-OrgOS-Tenant or tenant host required (ORGOS_REQUIRE_REQUEST_TENANT=1)",
    };
  }

  return { ok: true, tenantId: sessionTenant };
}

export function resolveRequestTenantOrNull(req: IncomingMessage): string | null {
  return resolveTenantFromRequest(req);
}
