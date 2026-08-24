import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  OperatorPermission,
  OperatorRecord,
} from "../../../schemas/org/operator.js";
import { findOperatorById } from "../org/operators.js";
import type { WireConsoleUser } from "../wire-console/auth/session.js";
import { isLoopbackOnlyBind, isRemoteSocketAddress } from "./loopback.js";
import {
  isProdSecurityMode,
  resolveOperatorFromSessionUser,
  resolveOperatorPermissions,
} from "./operator-rbac.js";
import type { ChatPermission } from "./rbac.js";

/**
 * Zero-trust bind / auth policy for Operator Console (budget surface).
 *
 * - Auth off requires ORGOS_ALLOW_INSECURE_LOCAL=1 and loopback-only bind
 * - Non-loopback bind requires ORGOS_TRUST_EXTERNAL=1, auth on, CSRF on
 */
export function assertOperatorConsoleSurfaceReady(host: string): void {
  const authOff = process.env.STEWARD_CHAT_AUTH === "0";
  const insecureLocal = process.env.ORGOS_ALLOW_INSECURE_LOCAL === "1";
  const trustExternal = process.env.ORGOS_TRUST_EXTERNAL === "1";
  const csrfOff = process.env.ORGOS_CSRF === "0";
  const loopbackOnly = isLoopbackOnlyBind(host);

  if (!loopbackOnly && !trustExternal) {
    throw new Error(
      `Refusing bind host "${host}" — use 127.0.0.1 or set ORGOS_TRUST_EXTERNAL=1`,
    );
  }
  if (!loopbackOnly && authOff) {
    throw new Error(
      `Refusing non-loopback bind with STEWARD_CHAT_AUTH=0 (host=${host})`,
    );
  }
  if (!loopbackOnly && csrfOff) {
    throw new Error(
      `Refusing non-loopback bind with ORGOS_CSRF=0 (host=${host})`,
    );
  }
  if (authOff && !insecureLocal) {
    throw new Error(
      "STEWARD_CHAT_AUTH=0 requires ORGOS_ALLOW_INSECURE_LOCAL=1 (loopback evaluation only)",
    );
  }
  if (authOff && !loopbackOnly) {
    throw new Error("STEWARD_CHAT_AUTH=0 is only allowed on loopback binds");
  }
  if (isProdSecurityMode() && authOff) {
    throw new Error("STEWARD_CHAT_AUTH=0 is forbidden in production security mode");
  }
}

/** Budget APIs never accept the anonymous auth-bypass identity. */
export function isAnonymousBudgetIdentity(user: WireConsoleUser): boolean {
  return (
    user.operator_id === "dev-bypass" ||
    user.approver_id === "dev-bypass" ||
    !user.operator_id?.trim()
  );
}

export function requireBudgetSurfacePermission(
  user: WireConsoleUser,
  perm: OperatorPermission | ChatPermission,
  res: ServerResponse,
): boolean {
  if (isAnonymousBudgetIdentity(user)) {
    res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        ok: false,
        error: "unauthorized",
        detail: "budget surface requires an authenticated operator session",
      }),
    );
    return false;
  }

  const record = resolveOperatorFromSessionUser(user);
  if (!record || record.status !== "active") {
    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        ok: false,
        error: "forbidden",
        detail: "operator not in registry",
        permission: perm,
      }),
    );
    return false;
  }

  const perms = resolveOperatorPermissions(record);
  if (!perms.includes(perm as OperatorPermission)) {
    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "forbidden", permission: perm }));
    return false;
  }
  return true;
}

export function resolveBudgetActor(user: WireConsoleUser): OperatorRecord {
  if (isAnonymousBudgetIdentity(user)) {
    throw new Error("budget surface requires an authenticated operator session");
  }
  const record = resolveOperatorFromSessionUser(user);
  if (record) return record;
  // Dev login may pass operator_id directly; resolve once more by id.
  const byId = findOperatorById(user.operator_id);
  if (byId && byId.status === "active") return byId;
  throw new Error(`Unknown operator for session: ${user.operator_id}`);
}

/** Reject non-loopback callers when insecure local mode is active. */
export function rejectNonLoopbackInsecure(
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  if (process.env.STEWARD_CHAT_AUTH !== "0") return false;
  if (process.env.ORGOS_ALLOW_INSECURE_LOCAL !== "1") return false;
  const remote = req.socket.remoteAddress;
  if (!isRemoteSocketAddress(remote)) return false;
  res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
  res.end(
    JSON.stringify({
      ok: false,
      error: "forbidden",
      detail: "insecure local mode rejects non-loopback clients",
    }),
  );
  return true;
}
