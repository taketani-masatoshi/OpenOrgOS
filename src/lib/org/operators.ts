import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import YAML from "yaml";
import {
  operatorRegistrySchema,
  type OperatorRecord,
  type OperatorRegistry,
  type OperatorRole,
} from "../../../schemas/org/operator.js";
import type { OrgChartNode } from "../../../schemas/org/org-chart.js";
import { tenantDataPath, getTenantId } from "../tenant.js";
import { writeYamlFile } from "../utils.js";
import { loadOrgChart } from "./org-chart.js";

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
  cachedRegistry = operatorRegistrySchema.parse(
    YAML.parse(readFileSync(path, "utf-8")),
  );
  return cachedRegistry;
}

export function saveOperatorRegistry(registry: OperatorRegistry): string {
  const path = operatorsRegistryPath();
  writeYamlFile(path, registry);
  cachedRegistryTenant = getTenantId();
  cachedRegistry = registry;
  return path;
}

export function listActiveOperators(): OperatorRecord[] {
  const reg = loadOperatorRegistry();
  if (!reg) return [];
  return reg.operators.filter((o) => o.status === "active");
}

export type OutlookPublishCandidate = {
  operator_id: string;
  /** Org-chart / person label preferred over agent-style operator names. */
  display_name: string;
  role: OperatorRole;
};

const AGENTISH_NAME =
  /オペレータ|オペレーター|エージェント|secretary|agent|steward|mcp/i;

function normalizePersonName(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function looksLikeAgentName(value: string | undefined): boolean {
  return Boolean(value && AGENTISH_NAME.test(value));
}

function isOutlookPublishRole(op: OperatorRecord): boolean {
  if (
    op.role === "mcp_service" ||
    op.role === "auditor" ||
    op.role === "readonly" ||
    op.role === "operator"
  ) {
    return false;
  }
  if (op.role === "ceo" || op.role === "approver") return true;
  return Boolean(op.permissions?.includes("chat:approve"));
}

/** Org-chart humans who may approve outlook publish (CEO / 本部長). */
function isHumanApproverChartNode(node: OrgChartNode): boolean {
  if (node.board_role === "representative_director") return true;
  if (/本部長|代表取締役/.test(node.title)) return true;
  if (node.employee_id && /長$/.test(node.title)) return true;
  return false;
}

function matchOperatorForChartPerson(
  node: OrgChartNode,
  operators: OperatorRecord[],
): OperatorRecord | undefined {
  const label = normalizePersonName(node.display_name);
  if (!label) return undefined;

  const byName = operators.find((op) => {
    if (looksLikeAgentName(op.display_name) || looksLikeAgentName(op.approver_name)) {
      return false;
    }
    const names = [op.approver_name, op.display_name]
      .filter((value): value is string => Boolean(value?.trim()))
      .map(normalizePersonName);
    return names.some(
      (name) => name.includes(label) || label.includes(name) || name.startsWith(label),
    );
  });
  if (byName) return byName;

  if (node.board_role === "representative_director") {
    return operators.find((op) => op.role === "ceo");
  }
  return undefined;
}

/** Prefer org-chart human labels (e.g. 段) over operator/agent display names. */
export function humanDisplayNameForOperator(op: OperatorRecord): string {
  const chart = loadOrgChart();
  const fallback = op.approver_name?.trim() || op.display_name;
  if (!chart || looksLikeAgentName(fallback)) {
    if (op.role === "ceo") {
      const representative = chart?.nodes.find(
        (node) => node.board_role === "representative_director",
      );
      if (representative) return representative.display_name;
    }
    return fallback;
  }

  if (op.role === "ceo") {
    const representative = chart.nodes.find(
      (node) => node.board_role === "representative_director",
    );
    if (representative) return representative.display_name;
  }

  const needles = [op.approver_name, op.display_name]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizePersonName);

  for (const node of chart.nodes) {
    if (!isHumanApproverChartNode(node) && !node.employee_id) continue;
    const label = normalizePersonName(node.display_name);
    if (!label) continue;
    if (needles.some((needle) => needle.includes(label) || label.includes(needle))) {
      return node.display_name;
    }
  }

  return fallback;
}

/**
 * Outlook publish / confirm candidates (ADR 0029 four-eyes).
 * Prefer org-chart humans (CEO / 本部長). Never list secretary/agent operators.
 */
export function listOutlookPublishCandidates(): OutlookPublishCandidate[] {
  const approverOps = listActiveOperators().filter(isOutlookPublishRole);
  const chart = loadOrgChart();
  const byId = new Map<string, OutlookPublishCandidate>();

  if (chart) {
    for (const node of chart.nodes) {
      if (!isHumanApproverChartNode(node)) continue;
      const op = matchOperatorForChartPerson(node, approverOps);
      if (!op) continue;
      if (looksLikeAgentName(op.display_name) || looksLikeAgentName(op.approver_name)) {
        continue;
      }
      byId.set(op.operator_id, {
        operator_id: op.operator_id,
        display_name: node.display_name,
        role: op.role,
      });
    }
  }

  if (byId.size > 0) {
    return [...byId.values()];
  }

  return approverOps
    .filter(
      (op) =>
        !looksLikeAgentName(op.display_name) &&
        !looksLikeAgentName(op.approver_name),
    )
    .map((op) => ({
      operator_id: op.operator_id,
      display_name: humanDisplayNameForOperator(op),
      role: op.role,
    }));
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
