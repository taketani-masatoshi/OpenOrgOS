import type {
  OperatorPermission,
  OperatorRecord,
} from "../../../schemas/org/operator.js";
import { collectGrantExtras } from "./access-grants.js";
import { isCeoConcentratedProfile } from "./governance-policy.js";
import { loadOperatorRegistry } from "./operators.js";
import { loadOrgChart } from "./org-chart.js";

/** Permissions that require CEO role default or explicit elevation under ceo_concentrated. */
export const DANGEROUS_PERMISSIONS: OperatorPermission[] = [
  "chat:approve",
  "chat:wire",
  "protocol:approve",
  "broker:transfer",
  "finance:reconcile",
  "scheduling:approve",
  "agent:shell",
  "git:write",
  "llm:admin",
  "llm:approve",
  "receipt:issue",
  "guard:admin",
];

const ROLE_PERMISSIONS_FULL: Record<
  OperatorRecord["role"],
  OperatorPermission[]
> = {
  ceo: [
    "chat:read",
    "chat:ask",
    "chat:approve",
    "chat:wire",
    "protocol:approve",
    "protocol:draft",
    "broker:transfer",
    "finance:reconcile",
    "scheduling:write",
    "scheduling:approve",
    "escalate:plan",
    "escalate:run",
    "escalate:complete",
    "agent:dispatch",
    "agent:order",
    "agent:report",
    "agent:shell",
    "git:write",
    "audit:read",
    "llm:admin",
    "llm:approve",
    "receipt:issue",
    "events:write",
    "guard:admin",
    "expense:claim",
  ],
  approver: [
    "chat:read",
    "chat:ask",
    "chat:approve",
    "chat:wire",
    "protocol:approve",
    "protocol:draft",
    "broker:transfer",
    "finance:reconcile",
    "scheduling:write",
    "scheduling:approve",
    "agent:shell",
    "git:write",
    "llm:approve",
    "receipt:issue",
    "guard:admin",
  ],
  operator: [
    "chat:read",
    "chat:ask",
    "scheduling:write",
    "escalate:plan",
    "escalate:run",
    "escalate:complete",
    "agent:dispatch",
    "agent:order",
    "agent:report",
    "events:write",
  ],
  employee: ["expense:claim"],
  readonly: ["chat:read"],
  mcp_service: ["chat:read", "chat:ask"],
  auditor: ["chat:read", "audit:read"],
};

/** Approver base under ceo_concentrated — dangerous ops only via explicit permissions / grants. */
const APPROVER_CONCENTRATED_BASE: OperatorPermission[] = [
  "chat:read",
  "chat:ask",
  "protocol:draft",
  "scheduling:write",
];

export function roleDefaultPermissions(
  role: OperatorRecord["role"],
  concentrated = isCeoConcentratedProfile(),
): OperatorPermission[] {
  if (concentrated && role === "approver")
    return [...APPROVER_CONCENTRATED_BASE];
  return [...(ROLE_PERMISSIONS_FULL[role] ?? [])];
}

export interface EffectiveOperatorAccess {
  record: OperatorRecord;
  permissions: OperatorPermission[];
  allowed_agents: string[] | null;
  /** null = unrestricted (typically ceo). */
  data_path_globs: string[] | null;
  grant_ids: string[];
  authority_profile: "ceo_concentrated" | "dual_control";
}

export function resolveEffectiveOperatorAccess(
  record: OperatorRecord,
  nowIso = new Date().toISOString(),
): EffectiveOperatorAccess {
  const concentrated = isCeoConcentratedProfile();
  const base = new Set<OperatorPermission>(
    roleDefaultPermissions(record.role, concentrated),
  );
  for (const p of record.permissions ?? []) base.add(p);

  const grants = collectGrantExtras(record.operator_id, nowIso);
  for (const p of grants.permissions) base.add(p);

  const agents = new Set<string>(record.allowed_agents ?? []);
  for (const a of grants.allowed_agents) agents.add(a);

  const globs = new Set<string>(record.data_path_globs ?? []);
  for (const g of grants.data_path_globs) globs.add(g);

  const unrestrictedAgents =
    record.role === "ceo" ||
    (record.allowed_agents === undefined && grants.allowed_agents.length === 0);
  const unrestrictedPaths =
    record.role === "ceo" ||
    (record.data_path_globs === undefined &&
      grants.data_path_globs.length === 0 &&
      globs.size === 0);

  return {
    record,
    permissions: [...base],
    allowed_agents: unrestrictedAgents ? null : [...agents],
    data_path_globs: unrestrictedPaths ? null : [...globs],
    grant_ids: grants.grant_ids,
    authority_profile: concentrated ? "ceo_concentrated" : "dual_control",
  };
}

export function effectiveHasPermission(
  record: OperatorRecord,
  perm: OperatorPermission,
  nowIso = new Date().toISOString(),
): boolean {
  if (record.status !== "active") return false;
  return resolveEffectiveOperatorAccess(record, nowIso).permissions.includes(
    perm,
  );
}

export function assertAgentAllowed(
  record: OperatorRecord,
  agentId: string,
  nowIso = new Date().toISOString(),
): void {
  const eff = resolveEffectiveOperatorAccess(record, nowIso);
  if (eff.allowed_agents === null) return;
  if (eff.allowed_agents.includes(agentId)) return;
  throw new Error(
    `Operator "${record.operator_id}" is not allowed to use agent "${agentId}"` +
      (eff.allowed_agents.length
        ? ` (allowed: ${eff.allowed_agents.join(", ")})`
        : " (no allowed_agents — request an access grant)"),
  );
}

export function assertDataPathAllowed(
  record: OperatorRecord,
  relPath: string,
  nowIso = new Date().toISOString(),
): void {
  const eff = resolveEffectiveOperatorAccess(record, nowIso);
  if (eff.data_path_globs === null) return;
  if (eff.data_path_globs.length === 0) {
    throw new Error(
      `Operator "${record.operator_id}" has no data_path_globs — path write denied: ${relPath}`,
    );
  }
  const normalized = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  const ok = eff.data_path_globs.some((glob) =>
    matchSimpleGlob(glob, normalized),
  );
  if (!ok) {
    throw new Error(
      `Operator "${record.operator_id}" cannot access path "${relPath}" (globs: ${eff.data_path_globs.join(", ")})`,
    );
  }
}

/** Minimal glob: `*` within one segment or `**` suffix / prefix patterns. */
export function matchSimpleGlob(glob: string, path: string): boolean {
  const g = glob.replace(/\\/g, "/").replace(/^\.\//, "");
  const p = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (g === p) return true;
  if (g.endsWith("/**")) {
    const prefix = g.slice(0, -3);
    return p === prefix || p.startsWith(`${prefix}/`);
  }
  if (g.includes("*")) {
    const re = new RegExp(
      `^${g
        .split("*")
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*")}$`,
    );
    return re.test(p);
  }
  return false;
}

export function validateOperatorGovernance(opts?: {
  requireCeo?: boolean;
}): string[] {
  const errors: string[] = [];
  const reg = loadOperatorRegistry();
  if (!reg?.operators.length) {
    if (opts?.requireCeo) errors.push("operators.yaml missing or empty");
    return errors;
  }

  const active = reg.operators.filter((o) => o.status === "active");
  const ceos = active.filter((o) => o.role === "ceo");
  const auditors = active.filter((o) => o.role === "auditor");

  if (opts?.requireCeo && ceos.length === 0) {
    errors.push("Production requires at least one active ceo operator");
  }

  const identityKey = (o: OperatorRecord): string => {
    if (o.stakeholder_id?.trim()) return `sid:${o.stakeholder_id.trim()}`;
    return `name:${o.display_name.replace(/\s+/g, "").trim().toLowerCase()}`;
  };

  const ceoKeys = new Set(ceos.map(identityKey));
  for (const a of auditors) {
    if (ceoKeys.has(identityKey(a))) {
      errors.push(
        `CEO/auditor overlap forbidden for "${a.display_name}" (${a.operator_id}) — ADR 0019`,
      );
    }
  }

  const chart = loadOrgChart();
  if (chart) {
    const nodeIds = new Set(chart.nodes.map((n) => n.id));
    for (const o of active) {
      if (o.org_unit_id && !nodeIds.has(o.org_unit_id)) {
        errors.push(
          `Operator ${o.operator_id} org_unit_id "${o.org_unit_id}" not in org-chart.yaml`,
        );
      }
    }
  }

  return errors;
}
