import type { WebAuthnCredentialPurpose } from "../../../../schemas/org/settlement-stepup.js";
import { isProdSecurityMode } from "../../console-auth/operator-rbac.js";
import { loadAuthorizedApprovers, normalizePersonName } from "../../org/authorized-approvers.js";
import {
  findOperatorById,
  loadOperatorRegistry,
} from "../../org/operators.js";
import {
  verifyPasskeyBootstrapToken,
} from "./passkey-bootstrap.js";
import type { WireConsoleUser } from "./session.js";
import {
  listWebAuthnCredentialsByPurpose,
  WebAuthnCredentialStoreCorruptError,
} from "./webauthn-store.js";
import { rpId } from "./webauthn-shared.js";

export { normalizePersonName as normalizeRegistrationPersonName };

export interface ResolvedRegistrationIdentity {
  operator_id: string;
  approver_id: string;
}

function approverMatchesRegistry(operatorApprover: string | undefined, requested: string): boolean {
  if (!operatorApprover?.trim()) return false;
  const a = normalizePersonName(operatorApprover);
  const r = normalizePersonName(requested);
  return a === r || a.includes(r) || r.includes(a);
}

function approverIsAuthorized(requested: string): boolean {
  const norm = normalizePersonName(requested);
  const authorized = loadAuthorizedApprovers();
  if (authorized.length === 0) return !isProdSecurityMode();
  return authorized.some((a) => a === norm || a.includes(norm) || norm.includes(a));
}

function operatorMayRegisterSettlement(operatorId: string): boolean {
  const op = findOperatorById(operatorId);
  if (!op) return false;
  if (op.role === "ceo" || op.role === "approver") return true;
  return Boolean(op.permissions?.includes("chat:approve"));
}

/**
 * Map client-supplied ids to registry-backed operator + approver names.
 */
export function resolveRegistryRegistrationIdentity(body: {
  operator_id: string;
  approver_id: string;
  purpose: WebAuthnCredentialPurpose;
}): ResolvedRegistrationIdentity | { error: string } {
  const operatorId = body.operator_id.trim();
  const approverId = body.approver_id.trim();
  if (!operatorId || !approverId) {
    return { error: "operator_id and approver_id required" };
  }

  const registry = loadOperatorRegistry();
  if (!registry) {
    if (isProdSecurityMode()) {
      return { error: "operator registry not configured" };
    }
    return { operator_id: operatorId, approver_id: approverId };
  }

  const operator = findOperatorById(operatorId);
  if (!operator) {
    return { error: `unknown operator_id: ${operatorId}` };
  }

  const approverOk =
    approverMatchesRegistry(operator.approver_name, approverId) ||
    approverMatchesRegistry(operator.display_name, approverId) ||
    approverIsAuthorized(approverId);

  if (!approverOk) {
    return {
      error: `approver_id "${approverId}" is not authorized for operator ${operatorId}`,
    };
  }

  if (body.purpose === "settlement" && !operatorMayRegisterSettlement(operatorId)) {
    return {
      error: `operator ${operatorId} is not permitted to register a settlement passkey`,
    };
  }

  const canonicalApprover =
    operator.approver_name?.trim() ||
    operator.display_name.trim() ||
    approverId;

  return {
    operator_id: operator.operator_id,
    approver_id: canonicalApprover,
  };
}

export function isLoginPasskeyBootstrap(): boolean {
  return listWebAuthnCredentialsByPurpose("login", { rpId: rpId() }).length === 0;
}

/** Production first-login passkey requires CLI-minted bootstrap token. */
export function isBootstrapTokenRequiredForLoginRegistration(): boolean {
  if (!isProdSecurityMode()) return false;
  try {
    return isLoginPasskeyBootstrap();
  } catch {
    return false;
  }
}

/** Public config: first login passkey may be enrolled (requires authenticated session at API). */
export function isLoginPasskeyBootstrapAllowed(): boolean {
  if (process.env.WIRE_CONSOLE_WEBAUTHN_DISABLE_REGISTER === "1") return false;
  return isLoginPasskeyBootstrap();
}

/** Additional login passkeys after bootstrap (off by default in production). */
export function isAdditionalLoginPasskeyRegistrationAllowed(): boolean {
  return process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_ADDITIONAL_LOGIN === "1";
}

export function isWebAuthnLoginRegistrationAllowedPublic(): boolean {
  if (process.env.WIRE_CONSOLE_WEBAUTHN_DISABLE_REGISTER === "1") return false;
  if (isLoginPasskeyBootstrap()) return true;
  return isAdditionalLoginPasskeyRegistrationAllowed();
}

function openBootstrapWithoutSessionAllowed(): boolean {
  return process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_OPEN_BOOTSTRAP === "1";
}

export function assertBootstrapTokenForLoginRegistration(
  sessionUser: WireConsoleUser | undefined,
  bootstrapToken?: string,
): { error: string; status: number } | null {
  if (!isProdSecurityMode()) return null;
  let bootstrap: boolean;
  try {
    bootstrap = isLoginPasskeyBootstrap();
  } catch {
    return null;
  }
  if (!bootstrap) return null;
  if (!sessionUser) return null;
  const verified = verifyPasskeyBootstrapToken(bootstrapToken, sessionUser.operator_id);
  if (!verified.ok) {
    return {
      error:
        verified.error === "bootstrap token required"
          ? "bootstrap token required for first passkey registration in production"
          : verified.error,
      status: verified.error === "bootstrap token required" ? 401 : 403,
    };
  }
  return null;
}

export function assertLoginPasskeyRegistrationGate(
  sessionUser: WireConsoleUser | undefined,
  bootstrapToken?: string,
): { error: string; status: number } | null {
  if (process.env.WIRE_CONSOLE_WEBAUTHN_DISABLE_REGISTER === "1") {
    return { error: "webauthn registration disabled", status: 403 };
  }

  let bootstrap: boolean;
  try {
    bootstrap = isLoginPasskeyBootstrap();
  } catch (error) {
    if (error instanceof WebAuthnCredentialStoreCorruptError) {
      return { error: "credential store unreadable", status: 503 };
    }
    throw error;
  }

  if (bootstrap) {
    if (!sessionUser && !openBootstrapWithoutSessionAllowed()) {
      return {
        error:
          "authenticated session required — sign in with Community SSO before registering your first passkey",
        status: 401,
      };
    }
    const tokenGate = assertBootstrapTokenForLoginRegistration(sessionUser, bootstrapToken);
    if (tokenGate) return tokenGate;
    return null;
  }

  if (!isAdditionalLoginPasskeyRegistrationAllowed()) {
    return { error: "webauthn registration disabled", status: 403 };
  }

  if (!sessionUser) {
    return {
      error: "authenticated session required to register a login passkey",
      status: 401,
    };
  }

  return null;
}

export function assertSettlementPasskeyRegistrationGate(
  sessionUser: WireConsoleUser | undefined,
  body: { operator_id: string; approver_id: string }
): { error: string; status: number } | null {
  if (process.env.WIRE_CONSOLE_WEBAUTHN_DISABLE_REGISTER === "1") {
    return { error: "webauthn registration disabled", status: 403 };
  }

  if (!sessionUser) {
    return {
      error: "authenticated session required to register a settlement passkey",
      status: 401,
    };
  }

  const op = body.operator_id.trim();
  const appr = body.approver_id.trim();
  if (
    normalizePersonName(sessionUser.operator_id) !== normalizePersonName(op) ||
    normalizePersonName(sessionUser.approver_id) !== normalizePersonName(appr)
  ) {
    return {
      error: "operator_id and approver_id must match your signed-in session",
      status: 403,
    };
  }

  return null;
}

/** When session exists, registration must target the signed-in operator identity. */
export function enforceSessionRegistrationIdentity(
  sessionUser: WireConsoleUser | undefined,
  resolved: ResolvedRegistrationIdentity
): { error: string; status: number } | null {
  if (!sessionUser) return null;
  if (
    normalizePersonName(sessionUser.operator_id) !==
      normalizePersonName(resolved.operator_id) ||
    normalizePersonName(sessionUser.approver_id) !== normalizePersonName(resolved.approver_id)
  ) {
    return {
      error: "passkey registration must use your signed-in operator identity",
      status: 403,
    };
  }
  return null;
}

export function authorizeWebAuthnRegistration(
  body: {
    operator_id: string;
    approver_id: string;
    purpose?: WebAuthnCredentialPurpose;
    bootstrap_token?: string;
  },
  sessionUser?: WireConsoleUser
): ResolvedRegistrationIdentity | { error: string; status: number } {
  const purpose: WebAuthnCredentialPurpose = body.purpose ?? "login";

  if (purpose === "login") {
    const gate = assertLoginPasskeyRegistrationGate(sessionUser, body.bootstrap_token);
    if (gate) return gate;
  } else {
    const gate = assertSettlementPasskeyRegistrationGate(sessionUser, body);
    if (gate) return gate;
  }

  const resolved = resolveRegistryRegistrationIdentity({
    operator_id: body.operator_id,
    approver_id: body.approver_id,
    purpose,
  });
  if ("error" in resolved) {
    const status = resolved.error.includes("not permitted") ? 403 : 422;
    return { error: resolved.error, status };
  }

  const sessionGate = enforceSessionRegistrationIdentity(sessionUser, resolved);
  if (sessionGate) return sessionGate;

  return resolved;
}

export function registrationErrorStatus(error: string): number {
  if (
    error.includes("session required") ||
    error.includes("authenticated session") ||
    error.includes("bootstrap token required")
  ) {
    return 401;
  }
  if (
    error.includes("disabled") ||
    error.includes("must match") ||
    error.includes("bootstrap token")
  ) {
    return 403;
  }
  return 422;
}
