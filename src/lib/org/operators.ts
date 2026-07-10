import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import {
  operatorRegistrySchema,
  type OperatorRecord,
  type OperatorRegistry,
} from "../../../schemas/org/operator.js";
import { tenantDataPath, getTenantId } from "../tenant.js";

export const OPERATORS_REGISTRY_REL = "org/operators.yaml";

let cachedRegistryTenant: string | undefined;
let cachedRegistry: OperatorRegistry | undefined;

export function operatorsRegistryPath(): string {
  return tenantDataPath("org", "operators.yaml");
}

export function clearOperatorsRegistryCacheForTests(): void {
  cachedRegistryTenant = undefined;
  cachedRegistry = undefined;
}

export function hashOperatorKey(key: string): string {
  return `sha256:${createHash("sha256").update(key.trim()).digest("hex")}`;
}

export function verifyOperatorKey(storedHash: string | undefined, key: string): boolean {
  if (!storedHash?.trim() || !key?.trim()) return false;
  const expected = hashOperatorKey(key);
  const a = Buffer.from(storedHash.trim(), "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function loadOperatorRegistry(): OperatorRegistry | undefined {
  const tenantId = getTenantId();
  if (cachedRegistry && cachedRegistryTenant === tenantId) return cachedRegistry;
  const path = operatorsRegistryPath();
  if (!existsSync(path)) {
    if (cachedRegistryTenant === tenantId) {
      cachedRegistry = undefined;
    }
    return undefined;
  }
  cachedRegistryTenant = tenantId;
  cachedRegistry = operatorRegistrySchema.parse(YAML.parse(readFileSync(path, "utf-8")));
  return cachedRegistry;
}

export function saveOperatorRegistry(registry: OperatorRegistry): string {
  const path = operatorsRegistryPath();
  writeFileSync(path, YAML.stringify(registry), "utf-8");
  cachedRegistryTenant = getTenantId();
  cachedRegistry = registry;
  return path;
}

export function listActiveOperators(): OperatorRecord[] {
  const reg = loadOperatorRegistry();
  if (!reg) return [];
  return reg.operators.filter((o) => o.status === "active");
}

export function findOperatorById(operatorId: string): OperatorRecord | undefined {
  return listActiveOperators().find((o) => o.operator_id === operatorId);
}

export function findOperatorByKey(key: string): OperatorRecord | undefined {
  return listActiveOperators().find((o) => verifyOperatorKey(o.key_hash, key));
}

export function findOperatorByEmail(email: string): OperatorRecord | undefined {
  const norm = email.trim().toLowerCase();
  return listActiveOperators().find((o) => o.email?.trim().toLowerCase() === norm);
}

export function findOperatorByApproverName(name: string): OperatorRecord | undefined {
  const norm = name.replace(/\s+/g, "").trim();
  return listActiveOperators().find((o) => {
    if (!o.approver_name) return false;
    const a = o.approver_name.replace(/\s+/g, "").trim();
    return a === norm || a.includes(norm) || norm.includes(a);
  });
}

export function registryHasApprovers(): boolean {
  const reg = loadOperatorRegistry();
  if (!reg?.operators.length) return false;
  return reg.operators.some(
    (o) =>
      o.status === "active" &&
      (o.role === "ceo" || o.role === "approver" || o.permissions?.includes("chat:approve"))
  );
}
