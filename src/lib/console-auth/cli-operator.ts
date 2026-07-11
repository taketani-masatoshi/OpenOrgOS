import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OperatorPermission } from "../../../schemas/org/operator.js";
import { appendAuditEvent } from "../audit-log.js";
import {
  authenticateOperator,
  isOperatorAuthBypassed,
  isOperatorAuthRequired,
  requireOperatorPermission,
  type AuthenticatedOperator,
} from "./operator-rbac.js";

let cliOperatorContext: AuthenticatedOperator | undefined;

export function setCliOperatorContext(auth: AuthenticatedOperator | undefined): void {
  cliOperatorContext = auth;
}

export function getCliOperatorContext(): AuthenticatedOperator | undefined {
  return cliOperatorContext;
}

export function readOperatorKeyFromFile(operatorId: string): string | undefined {
  const path = join(homedir(), ".orgos", "operators", `${operatorId}.key`);
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf-8").trim() || undefined;
}

export function resolveCliOperatorKey(operatorId: string, explicitKey?: string): string | undefined {
  return (
    explicitKey?.trim() ||
    process.env.ORGOS_OPERATOR_KEY?.trim() ||
    readOperatorKeyFromFile(operatorId)
  );
}

export function requireCliOperator(opts: {
  operatorId?: string;
  operatorKey?: string;
  permission: OperatorPermission;
  command: string;
}): AuthenticatedOperator {
  if (!isOperatorAuthRequired()) {
    const fallback: AuthenticatedOperator = {
      record: {
        operator_id: opts.operatorId ?? "dev-bypass",
        display_name: opts.operatorId ?? "dev-bypass",
        role: "ceo",
        status: "active",
      },
      permissions: [
        "chat:read",
        "chat:ask",
        "chat:approve",
        "chat:wire",
        "protocol:approve",
        "protocol:draft",
        "broker:transfer",
        "escalate:plan",
        "escalate:run",
        "escalate:complete",
        "agent:dispatch",
        "agent:order",
        "agent:report",
        "agent:shell",
        "git:write",
      ],
    };
    setCliOperatorContext(fallback);
    return fallback;
  }

  const operatorId = opts.operatorId?.trim() || process.env.ORGOS_CLI_OPERATOR_ID?.trim();
  if (!operatorId) {
    throw new Error(
      `Mutation command "${opts.command}" requires --operator-id (or STEWARD_OPERATOR_AUTH=0 for dev bypass)`
    );
  }

  const key = resolveCliOperatorKey(operatorId, opts.operatorKey);
  const auth = authenticateOperator({ operatorId, key });
  if ("error" in auth) {
    throw new Error(auth.error);
  }

  requireOperatorPermission(auth, opts.permission);
  setCliOperatorContext(auth);
  appendAuditEvent({
    event: "escalate",
    ref: auth.record.operator_id,
    detail: `operator_auth:${opts.command}:${opts.permission}`,
  });
  return auth;
}

/** CLI data writes (finances · executive · secretary · migrate). */
export function requireCliDataWrite(opts: {
  command: string;
  permission?: OperatorPermission;
}): AuthenticatedOperator {
  return requireCliOperator({
    permission: opts.permission ?? "escalate:plan",
    command: opts.command,
  });
}

/** CLI docs/report writes (dashboard · alerts · report · skills). */
export function requireCliReportWrite(command: string): AuthenticatedOperator {
  return requireCliDataWrite({ command, permission: "agent:report" });
}

/** CLI tenant config writes (audit-bridge · wire-gateway tls). */
export function requireCliConfigWrite(command: string): AuthenticatedOperator {
  return requireCliDataWrite({ command, permission: "escalate:plan" });
}

/** Human-only approval (correspondence · wire) — no dev bypass. */
export function requireCliHumanApproval(command: string): AuthenticatedOperator {
  if (isOperatorAuthBypassed()) {
    throw new Error(
      `${command} requires operator authentication (STEWARD_OPERATOR_AUTH=1). ` +
        "Dev bypass is not allowed for human approval actions."
    );
  }
  const auth = requireCliOperator({ permission: "chat:approve", command });
  if (auth.record.role !== "ceo" && auth.record.role !== "approver") {
    throw new Error(
      `${command} requires ceo or approver role (got ${auth.record.role}). Agents cannot approve.`
    );
  }
  return auth;
}

/** Outbound correspondence send — human approver only; no dev bypass. */
export function requireCliCorrespondenceSend(command: string): AuthenticatedOperator {
  if (isOperatorAuthBypassed()) {
    throw new Error(
      `${command} requires operator authentication (STEWARD_OPERATOR_AUTH=1, --operator-id, ORGOS_OPERATOR_KEY). ` +
        "Dev bypass is not allowed for outbound mail."
    );
  }
  const auth = requireCliOperator({ permission: "chat:approve", command });
  if (auth.record.role !== "ceo" && auth.record.role !== "approver") {
    throw new Error(
      `${command} requires ceo or approver role (got ${auth.record.role}). Secretary creates drafts only.`
    );
  }
  return auth;
}

export function auditCliMutation(command: string, detail: string): void {
  const ctx = getCliOperatorContext();
  appendAuditEvent({
    event: "escalate",
    ref: ctx?.record.operator_id ?? "unknown",
    detail: `cli_mutation:${command}:${detail}`,
  });
}
