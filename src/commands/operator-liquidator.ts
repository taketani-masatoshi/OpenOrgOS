import { appendJsonl } from "../lib/jsonl-store.js";
import {
  isOooLoginEmailAllowedForRegistry,
  normalizeOooLoginEmailPolicy,
} from "../lib/org/ooo-login-email.js";
import { loadOperatorRegistry, saveOperatorRegistry } from "../lib/org/operators.js";
import {
  getTenantLifecycleStatus,
  loadTenantLifecycle,
} from "../lib/org/tenant-lifecycle.js";
import { tenantDataPath } from "../lib/tenant.js";
import { operatorRegistrySchema } from "../../schemas/org/operator.js";

export const LIQUIDATOR_MAX_MONTHS = 24;

function requireRegistry() {
  const reg = loadOperatorRegistry();
  if (!reg) throw new Error("operators.yaml not found");
  return reg;
}

function assertWindingDown(): void {
  const status = getTenantLifecycleStatus();
  if (status !== "winding_down") {
    throw new Error(
      "liquidator seats may only be added while tenant lifecycle is winding_down — run orgos tenant lifecycle declare-winding-down",
    );
  }
}

function parseIsoDate(raw: string, label: string): number {
  const ms = Date.parse(raw.trim());
  if (Number.isNaN(ms)) throw new Error(`${label} must be a valid ISO date`);
  return ms;
}

/** Max liquidator expiry from winding_down declared_at (24 calendar months). */
export function maxLiquidatorExpiryMs(windingDeclaredAt: string): number {
  const start = parseIsoDate(windingDeclaredAt, "declared_at");
  const d = new Date(start);
  d.setUTCMonth(d.getUTCMonth() + LIQUIDATOR_MAX_MONTHS);
  return d.getTime();
}

export function assertLiquidatorExpiryWithinMax(
  until: string,
  windingDeclaredAt: string,
): void {
  const untilMs = parseIsoDate(until, "until");
  const maxMs = maxLiquidatorExpiryMs(windingDeclaredAt);
  if (untilMs > maxMs) {
    throw new Error(
      `liquidator guest_expires_at exceeds ${LIQUIDATOR_MAX_MONTHS}-month maximum from winding_down declared_at`,
    );
  }
}

function appendOperatorAudit(line: Record<string, unknown>): void {
  appendJsonl(tenantDataPath("org", "operator-audit.jsonl"), {
    at: new Date().toISOString(),
    ...line,
  });
}

function nextLiquidatorId(existing: string[]): string {
  const nums = existing
    .map((id) => /^OP-LIQ-(\d+)$/.exec(id)?.[1])
    .filter(Boolean)
    .map((n) => Number.parseInt(n!, 10));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `OP-LIQ-${String(next).padStart(3, "0")}`;
}

export function runOperatorLiquidatorAdd(opts: {
  email: string;
  until: string;
  displayName: string;
  json?: boolean;
}): void {
  assertWindingDown();
  const lifecycle = loadTenantLifecycle();
  if (!lifecycle.declared_at?.trim()) {
    throw new Error("tenant lifecycle missing declared_at");
  }

  const reg = requireRegistry();
  const email = opts.email.trim().toLowerCase();
  if (!isOooLoginEmailAllowedForRegistry(email, reg)) {
    throw new Error("liquidator email must be on login_policy.email_domains");
  }
  assertLiquidatorExpiryWithinMax(opts.until, lifecycle.declared_at);

  const policy = normalizeOooLoginEmailPolicy(reg.login_policy);
  if (policy.grandfather_emails.includes(email)) {
    throw new Error("liquidator may not use grandfather personal email");
  }

  const operatorId = nextLiquidatorId(reg.operators.map((o) => o.operator_id));
  const candidate = {
    operator_id: operatorId,
    display_name: opts.displayName.trim(),
    approver_name: opts.displayName.trim(),
    role: "readonly" as const,
    status: "active" as const,
    email,
    guest_expires_at: opts.until.trim(),
    seat_kind: "liquidator" as const,
    permissions: ["chat:read", "audit:read"] as const,
  };

  const next = operatorRegistrySchema.parse({
    ...reg,
    operators: [...reg.operators, candidate],
  });
  saveOperatorRegistry(next);
  appendOperatorAudit({
    action: "liquidator.add",
    operator_id: operatorId,
    guest_expires_at: opts.until.trim(),
  });

  const out = { operator_id: operatorId, guest_expires_at: opts.until.trim() };
  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`✓ liquidator seat added: ${operatorId}`);
  console.log(`  guest_expires_at: ${opts.until.trim()}`);
}

export function runOperatorLiquidatorExtend(opts: {
  operatorId: string;
  until: string;
  reason: string;
  json?: boolean;
}): void {
  const lifecycle = loadTenantLifecycle();
  if (!lifecycle.declared_at?.trim()) {
    throw new Error("tenant lifecycle missing declared_at");
  }
  assertLiquidatorExpiryWithinMax(opts.until, lifecycle.declared_at);

  const reg = requireRegistry();
  const idx = reg.operators.findIndex((o) => o.operator_id === opts.operatorId);
  if (idx < 0) throw new Error(`Operator ${opts.operatorId} not found`);
  const op = reg.operators[idx]!;
  if (op.seat_kind !== "liquidator") {
    throw new Error(`${opts.operatorId} is not a liquidator seat`);
  }

  const operators = [...reg.operators];
  operators[idx] = { ...op, guest_expires_at: opts.until.trim() };
  saveOperatorRegistry(operatorRegistrySchema.parse({ ...reg, operators }));

  appendOperatorAudit({
    action: "liquidator.extend",
    operator_id: opts.operatorId,
    guest_expires_at: opts.until.trim(),
    reason: opts.reason.trim().slice(0, 200),
  });

  const out = { operator_id: opts.operatorId, guest_expires_at: opts.until.trim() };
  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`✓ liquidator ${opts.operatorId} extended until ${opts.until.trim()}`);
}
