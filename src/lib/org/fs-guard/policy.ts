import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AgentId } from "../../../../schemas/classification.js";
import {
  fsGuardEventSchema,
  fsGuardGrantSchema,
  type FsGuardEvent,
  type FsGuardGrant,
  type FsGuardIdentitiesFile,
  type FsGuardOp,
  type FsGuardWriteIntent,
} from "../../../../schemas/org/fs-guard.js";
import { getAgentCapability, listAgentCapabilities } from "../../agent-capability.js";
import { getCatalogAgent, resolveAgentId } from "../../agent-catalog.js";
import { checkAgentAccess, findResourceByPath, loadClassificationRegistry } from "../../classification.js";
import { matchSimpleGlob } from "../operator-effective.js";
import { getClock, getIdGenerator } from "../../runtime-context.js";
import { resolveTenantPath, toLogicalPath } from "../../tenant.js";
import {
  generateFsGuardKeyPair,
  publicKeyFromPrivatePem,
  sha256Hex,
  signPayload,
  verifyPayload,
} from "./crypto.js";
import {
  agentPrivateKeyPath,
  appendGrantEvent,
  fsGuardPaths,
  isFsGuardEnforced,
  isFsGuardInitialized,
  issuerKeyPath,
  loadGrantEvents,
  loadIdentities,
  readPrivateKeyPem,
  saveGrantSnapshot,
  saveIdentities,
  type FsGuardPaths,
  writePrivateKeyPem,
} from "./store.js";

export class FsGuardError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FsGuardError";
    this.code = code;
  }
}

export interface FsGuardCheckResult {
  allowed: boolean;
  reason: string;
  grant_id?: string;
}

const ALLOWED_ROOTS = ["data/", "docs/", "records/", "runs/"] as const;

const FORBIDDEN_PATTERNS = [
  /(^|\/)\.git(\/|$)/,
  /(^|\/)src\//,
  /(^|\/)schemas\//,
  /(^|\/)steward\//,
  /(^|\/)node_modules\//,
  /(^|\/)\.env/,
  /\.pem$/i,
  /\.key$/i,
  /\/data\/\.orgos\//,
  /company-events(-chain)?\.(yaml|jsonl)$/,
];

function normalizeLogical(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function assertSafeGrantPattern(pathPattern: string): string {
  const n = normalizeLogical(pathPattern);
  if (!n || n.includes("..") || n.startsWith("/")) {
    throw new FsGuardError("invalid_pattern", `Unsafe path pattern: ${pathPattern}`);
  }
  if (!ALLOWED_ROOTS.some((root) => n === root.slice(0, -1) || n.startsWith(root))) {
    throw new FsGuardError(
      "invalid_pattern",
      `Path must be under data/, docs/, records/, or runs/: ${pathPattern}`
    );
  }
  if (FORBIDDEN_PATTERNS.some((re) => re.test(n))) {
    throw new FsGuardError("forbidden_pattern", `Path is not grantable: ${pathPattern}`);
  }
  return n;
}

function assertSafeTargetPath(logicalPath: string): string {
  return assertSafeGrantPattern(normalizeLogical(logicalPath));
}

function unsignedEvent(event: FsGuardEvent): Omit<FsGuardEvent, "signature"> {
  const { signature: _signature, ...rest } = event;
  return rest;
}

function loadIssuerPrivateKey(paths = fsGuardPaths()): string {
  const pem = readPrivateKeyPem(issuerKeyPath(paths));
  if (!pem) {
    throw new FsGuardError("issuer_missing", "FS-guard issuer key missing — run: orgos guard init");
  }
  return pem;
}

export function deriveGrantsFromEvents(
  events: FsGuardEvent[],
  issuerPublicKey: string,
  nowIso = getClock().nowIso()
): FsGuardGrant[] {
  const byId = new Map<string, FsGuardGrant>();
  for (const event of events) {
    if (!verifyPayload(unsignedEvent(event), event.signature, issuerPublicKey)) {
      throw new FsGuardError("bad_event_signature", `Grant event ${event.event_id} signature invalid`);
    }
    const parsed = fsGuardEventSchema.parse(event);
    if (parsed.type === "agent.grant.issued") {
      const p = parsed.payload;
      byId.set(
        p.grant_id,
        fsGuardGrantSchema.parse({
          grant_id: p.grant_id,
          agent_id: p.agent_id,
          key_id: p.key_id,
          op: p.op,
          path_pattern: p.path_pattern,
          issued_at: parsed.occurred_at,
          expires_at: p.expires_at,
          status: "active",
        })
      );
    } else if (parsed.type === "agent.grant.revoked") {
      const current = byId.get(parsed.payload.grant_id);
      if (current) {
        byId.set(parsed.payload.grant_id, {
          ...current,
          status: "revoked",
          revoked_at: parsed.occurred_at,
        });
      }
    }
  }
  return [...byId.values()].map((grant) => {
    if (grant.status === "revoked") return grant;
    if (grant.expires_at && Date.parse(grant.expires_at) <= Date.parse(nowIso)) {
      return { ...grant, status: "expired" as const };
    }
    return grant;
  });
}

function persistSnapshot(paths = fsGuardPaths()): FsGuardGrant[] {
  const identities = loadIdentities(paths);
  if (!identities) return [];
  const events = loadGrantEvents(paths);
  const grants = deriveGrantsFromEvents(events, identities.issuer.public_key);
  const last = events[events.length - 1];
  saveGrantSnapshot(
    {
      version: "1",
      derived_from_event_id: last?.event_id,
      grants,
    },
    paths
  );
  return grants;
}

function nextGrantId(existing: FsGuardGrant[], now = getClock().now()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `AGRNT-${day}-`;
  const nums = existing
    .map((g) => (g.grant_id.startsWith(prefix) ? Number(g.grant_id.slice(prefix.length)) : 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function ensureIssuer(paths = fsGuardPaths()): FsGuardIdentitiesFile {
  const existing = loadIdentities(paths);
  const existingPem = readPrivateKeyPem(issuerKeyPath(paths));
  if (existing && existingPem) {
    const derived = publicKeyFromPrivatePem(existingPem);
    if (derived.publicKey !== existing.issuer.public_key) {
      throw new FsGuardError("issuer_mismatch", "Issuer private key does not match identities.yaml");
    }
    return existing;
  }
  if (existing && !existingPem) {
    throw new FsGuardError("issuer_missing", "Identities exist but issuer private key is missing");
  }
  const pair = generateFsGuardKeyPair();
  writePrivateKeyPem(issuerKeyPath(paths), pair.privateKeyPem);
  const file: FsGuardIdentitiesFile = {
    version: "1",
    issuer: {
      public_key: pair.publicKey,
      key_id: pair.keyId,
      created_at: getClock().nowIso(),
    },
    agents: [],
  };
  saveIdentities(file, paths);
  persistSnapshot(paths);
  return file;
}

export function keygenAgent(
  agentId: string,
  opts?: { rotate?: boolean; paths?: FsGuardPaths }
): { agent_id: string; key_id: string; key_path: string } {
  const resolved = resolveAgentId(agentId);
  if (!resolved) throw new FsGuardError("unknown_agent", `Unknown agent: ${agentId}`);
  const paths = opts?.paths ?? fsGuardPaths();
  const identities = ensureIssuer(paths);
  const keyPath = agentPrivateKeyPath(resolved, paths);
  const existingPem = readPrivateKeyPem(keyPath);
  if (existingPem && !opts?.rotate) {
    const derived = publicKeyFromPrivatePem(existingPem);
    const row = identities.agents.find((a) => a.agent_id === resolved);
    if (row && row.public_key === derived.publicKey && row.status === "active") {
      return { agent_id: resolved, key_id: row.key_id, key_path: keyPath };
    }
  }
  const pair = generateFsGuardKeyPair();
  writePrivateKeyPem(keyPath, pair.privateKeyPem);
  const now = getClock().nowIso();
  const nextAgents = identities.agents.filter((a) => a.agent_id !== resolved);
  nextAgents.push({
    agent_id: resolved,
    public_key: pair.publicKey,
    key_id: pair.keyId,
    created_at: now,
    status: "active",
  });
  saveIdentities({ ...identities, agents: nextAgents }, paths);
  return { agent_id: resolved, key_id: pair.keyId, key_path: keyPath };
}

export function issueGrant(opts: {
  agentId: string;
  op: FsGuardOp;
  pathPattern: string;
  issuedBy: string;
  expiresAt?: string;
  reason?: string;
  paths?: FsGuardPaths;
}): FsGuardGrant {
  const paths = opts.paths ?? fsGuardPaths();
  const identities = ensureIssuer(paths);
  const resolved = resolveAgentId(opts.agentId);
  if (!resolved) throw new FsGuardError("unknown_agent", `Unknown agent: ${opts.agentId}`);
  const identity = identities.agents.find((a) => a.agent_id === resolved && a.status === "active");
  if (!identity) {
    throw new FsGuardError("agent_key_missing", `No active key for ${resolved} — run: orgos guard keygen --agent ${resolved}`);
  }
  const pathPattern = assertSafeGrantPattern(opts.pathPattern);
  const grants = persistSnapshot(paths);
  const grantId = nextGrantId(grants);
  const now = getClock().nowIso();
  const event: FsGuardEvent = {
    event_id: getIdGenerator().uuid(),
    type: "agent.grant.issued",
    occurred_at: now,
    issued_by: opts.issuedBy,
    payload: {
      grant_id: grantId,
      agent_id: resolved,
      key_id: identity.key_id,
      op: opts.op,
      path_pattern: pathPattern,
      expires_at: opts.expiresAt,
      reason: opts.reason,
    },
    signature: "",
  };
  event.signature = signPayload(unsignedEvent(event), loadIssuerPrivateKey(paths));
  appendGrantEvent(event, paths);
  persistSnapshot(paths);
  return fsGuardGrantSchema.parse({
    grant_id: grantId,
    agent_id: resolved,
    key_id: identity.key_id,
    op: opts.op,
    path_pattern: pathPattern,
    issued_at: now,
    expires_at: opts.expiresAt,
    status: "active",
  });
}

export function revokeGrant(opts: {
  grantId: string;
  issuedBy: string;
  reason?: string;
  paths?: FsGuardPaths;
}): FsGuardGrant {
  const paths = opts.paths ?? fsGuardPaths();
  const identities = loadIdentities(paths);
  if (!identities) throw new FsGuardError("not_initialized", "FS-guard is not initialized");
  const grants = persistSnapshot(paths);
  const current = grants.find((g) => g.grant_id === opts.grantId);
  if (!current) throw new FsGuardError("grant_missing", `Grant ${opts.grantId} not found`);
  const now = getClock().nowIso();
  const event: FsGuardEvent = {
    event_id: getIdGenerator().uuid(),
    type: "agent.grant.revoked",
    occurred_at: now,
    issued_by: opts.issuedBy,
    payload: {
      grant_id: current.grant_id,
      agent_id: current.agent_id,
      key_id: current.key_id,
      op: current.op,
      path_pattern: current.path_pattern,
      reason: opts.reason,
    },
    signature: "",
  };
  event.signature = signPayload(unsignedEvent(event), loadIssuerPrivateKey(paths));
  appendGrantEvent(event, paths);
  const derived = persistSnapshot(paths);
  const revoked = derived.find((g) => g.grant_id === opts.grantId);
  if (!revoked) throw new FsGuardError("grant_missing", `Grant ${opts.grantId} missing after revoke`);
  return revoked;
}

function classificationWriteAllowed(agentId: AgentId, logicalPath: string, op: FsGuardOp): FsGuardCheckResult | undefined {
  if (op !== "write") return undefined;
  let registry;
  try {
    registry = loadClassificationRegistry();
  } catch {
    return undefined;
  }
  const resource = findResourceByPath(registry, logicalPath);
  if (!resource) return undefined;
  const access = checkAgentAccess(registry, agentId, logicalPath, "write");
  if (access.allowed) return undefined;
  return { allowed: false, reason: access.reason };
}

export function checkAgentWritePolicy(
  agentId: string,
  logicalPath: string,
  op: FsGuardOp = "write",
  paths = fsGuardPaths()
): FsGuardCheckResult {
  const resolved = resolveAgentId(agentId);
  if (!resolved) return { allowed: false, reason: `Unknown agent: ${agentId}` };
  if (!isFsGuardInitialized(paths)) {
    return { allowed: false, reason: "FS-guard is not initialized — run: orgos guard init" };
  }
  let target: string;
  try {
    target = assertSafeTargetPath(logicalPath);
  } catch (err) {
    return {
      allowed: false,
      reason: err instanceof FsGuardError ? err.message : String(err),
    };
  }
  const identities = loadIdentities(paths);
  if (!identities) return { allowed: false, reason: "FS-guard identities missing" };
  const identity = identities.agents.find((a) => a.agent_id === resolved && a.status === "active");
  if (!identity) {
    return { allowed: false, reason: `No active public key for agent ${resolved}` };
  }
  const classified = classificationWriteAllowed(resolved, target, op);
  if (classified) return classified;
  const grants = deriveGrantsFromEvents(loadGrantEvents(paths), identities.issuer.public_key);
  const match = grants.find(
    (g) =>
      g.status === "active" &&
      g.agent_id === resolved &&
      g.key_id === identity.key_id &&
      g.op === op &&
      matchSimpleGlob(g.path_pattern, target)
  );
  if (!match) {
    return {
      allowed: false,
      reason: `${resolved} has no ${op} grant for ${target}`,
    };
  }
  return { allowed: true, reason: "ok", grant_id: match.grant_id };
}

function unsignedIntent(intent: FsGuardWriteIntent): Omit<FsGuardWriteIntent, "signature"> {
  const { signature: _signature, ...rest } = intent;
  return rest;
}

export function applyAgentWrite(opts: {
  agentId: string;
  path: string;
  content: string | Buffer;
  runId?: string;
  paths?: FsGuardPaths;
}): { path: string; grant_id?: string; content_sha256: string } {
  const paths = opts.paths ?? fsGuardPaths();
  const resolved = resolveAgentId(opts.agentId);
  if (!resolved) throw new FsGuardError("unknown_agent", `Unknown agent: ${opts.agentId}`);
  const logical = assertSafeTargetPath(opts.path);
  const policy = checkAgentWritePolicy(resolved, logical, "write", paths);
  if (!policy.allowed) {
    throw new FsGuardError("denied", policy.reason);
  }
  const identities = loadIdentities(paths);
  const identity = identities?.agents.find((a) => a.agent_id === resolved && a.status === "active");
  if (!identity) throw new FsGuardError("agent_key_missing", `No active key for ${resolved}`);
  const pem = readPrivateKeyPem(agentPrivateKeyPath(resolved, paths));
  if (!pem) {
    throw new FsGuardError(
      "agent_key_missing",
      `Agent private key missing for ${resolved} (runtime holds the key; LLM must not)`
    );
  }
  const contentSha = sha256Hex(opts.content);
  const intent: FsGuardWriteIntent = {
    agent_id: resolved,
    op: "write",
    path: logical,
    content_sha256: contentSha,
    issued_at: getClock().nowIso(),
    run_id: opts.runId,
    signature: "",
  };
  intent.signature = signPayload(unsignedIntent(intent), pem);
  if (!verifyPayload(unsignedIntent(intent), intent.signature, identity.public_key)) {
    throw new FsGuardError("bad_intent_signature", "Write intent signature did not verify");
  }
  const abs = resolveTenantPath(logical);
  const roundTrip = normalizeLogical(toLogicalPath(abs));
  if (roundTrip !== logical && !roundTrip.endsWith(`/${logical}`) && roundTrip !== logical.replace(/\/$/, "")) {
    if (roundTrip.includes("..")) {
      throw new FsGuardError("path_escape", `Resolved path escapes tenant: ${logical}`);
    }
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, opts.content, typeof opts.content === "string" ? "utf-8" : undefined);
  return { path: logical, grant_id: policy.grant_id, content_sha256: contentSha };
}

function asDirectoryPattern(rel: string): string {
  const n = normalizeLogical(rel);
  if (n.endsWith("/**")) return n;
  if (n.endsWith("/")) return `${n}**`;
  if (/\.[a-z0-9]+$/i.test(n.split("/").pop() ?? "")) return n;
  return `${n.replace(/\/$/, "")}/**`;
}

export function seedGrantsFromCatalog(opts: {
  issuedBy: string;
  paths?: FsGuardPaths;
  agentIds?: string[];
}): { agents: string[]; grants: number } {
  const paths = opts.paths ?? fsGuardPaths();
  ensureIssuer(paths);
  const capabilities = opts.agentIds?.length
    ? listAgentCapabilities().filter((c) => opts.agentIds?.includes(c.id))
    : listAgentCapabilities();
  let grants = 0;
  const agents: string[] = [];
  for (const cap of capabilities) {
    const writes = [...(cap.data_paths ?? []), ...(cap.docs_paths ?? [])];
    const catalog = getCatalogAgent(cap.id);
    for (const p of catalog?.access.write ?? []) writes.push(p);
    if (cap.summary_slug) {
      writes.push(`docs/reports/agent-summaries/${cap.summary_slug}/`);
    }
    const unique = [...new Set(writes.map(asDirectoryPattern).filter(Boolean))];
    if (!unique.length) continue;
    keygenAgent(cap.id, { paths });
    agents.push(cap.id);
    for (const pattern of unique) {
      try {
        assertSafeGrantPattern(pattern);
      } catch {
        continue;
      }
      issueGrant({
        agentId: cap.id,
        op: "write",
        pathPattern: pattern,
        issuedBy: opts.issuedBy,
        reason: "catalog-seed",
        paths,
      });
      grants += 1;
    }
  }
  return { agents, grants };
}

export function assertDispatchPathAllowed(agentId: string, logicalPath: string): void {
  if (!isFsGuardEnforced()) return;
  const result = checkAgentWritePolicy(agentId, logicalPath, "write");
  if (!result.allowed) {
    throw new FsGuardError("dispatch_denied", `Dispatch blocked by fs-guard: ${result.reason}`);
  }
}

export { isFsGuardEnforced, isFsGuardInitialized };
