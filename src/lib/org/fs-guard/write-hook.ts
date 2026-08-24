import { createRequire } from "node:module";
import { getFsGuardAgent, isFsGuardInternal } from "./context.js";
import { FsGuardError } from "./errors.js";
import { assertFsGuardProdReady, isFsGuardEnforced } from "./store.js";
import { withCanonicalLease } from "./lease.js";
import { toLogicalPath } from "../../tenant.js";
import { assertEventsWriteAuthorized } from "../../company-events-write-guard.js";

const require = createRequire(import.meta.url);

type FsGuardWriteAssert = (absPath: string, agentId: string, logicalPath: string) => void;

let writeAssert: FsGuardWriteAssert | undefined;

/** Registered from policy.ts after modules load — avoids utils ↔ policy import cycles. */
export function registerFsGuardWriteAssert(fn: FsGuardWriteAssert): void {
  writeAssert = fn;
}

export type FsGuardPathClass = "none" | "platform" | "agent_forbidden" | "gated";

function normalizeLogicalPath(logicalPath: string): string {
  return logicalPath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function isAgentForbiddenLogicalPath(n: string): boolean {
  return (
    n === "data/org/agent-identities.yaml" ||
    n.endsWith("/agent-identities.yaml") ||
    n === "data/org/fs-guard-events.jsonl" ||
    n === "data/org/fs-guard-grants.yaml" ||
    n === "data/org/fs-guard-applies.jsonl" ||
    /\/fs-guard-(events|grants|applies)\.(yaml|jsonl)$/.test(n) ||
    n === "data/org/operators.yaml" ||
    n === "data/org/access-grants.yaml" ||
    n === "data/protocol/signing-key.pem" ||
    n.startsWith("data/protocol/witness-trust/")
  );
}

/** Classify tenant-relative paths for FS-guard enforcement. */
export function classifyCanonicalLogicalPath(logicalPath: string): FsGuardPathClass {
  const n = normalizeLogicalPath(logicalPath);
  if (n.startsWith("data/.orgos/") || n.startsWith("data/chat/") || n.startsWith("data/scratch/")) {
    return "platform";
  }
  if (isAgentForbiddenLogicalPath(n)) return "agent_forbidden";
  if (n.startsWith("data/") || n.startsWith("docs/") || n.startsWith("records/")) return "gated";
  return "none";
}

/** Runtime-internal paths — grant and prod checks skipped (guard init, chat, scratch). */
export function isFsGuardPlatformPath(logicalPath: string): boolean {
  return classifyCanonicalLogicalPath(logicalPath) === "platform";
}

/** Agent context (and guard apply) must never mutate these paths. */
export function isAgentForbiddenPath(logicalPath: string): boolean {
  return classifyCanonicalLogicalPath(logicalPath) === "agent_forbidden";
}

/** Canonical tenant paths that require a signed grant under agent context. */
export function isAgentCanonicalLogicalPath(logicalPath: string): boolean {
  return classifyCanonicalLogicalPath(logicalPath) === "gated";
}

/**
 * When an AIA/Skill is running under an agent identity and the tenant gate is on,
 * canonical YAML writes must match a signed grant. Human CLI (no agent context) skips.
 */
export function assertFsGuardCanonicalWrite(absPath: string): void {
  const agentId = getFsGuardAgent();
  if (!agentId) return;
  if (!writeAssert) {
    require("./policy.js");
  }
  if (!writeAssert) return;
  const logical = normalizeLogicalPath(toLogicalPath(absPath));
  const pathClass = classifyCanonicalLogicalPath(logical);
  if (pathClass === "platform" || pathClass === "none") return;
  if (pathClass === "agent_forbidden") {
    throw new FsGuardError(
      "agent_forbidden",
      `Agent ${agentId} cannot write ${logical} (RBAC / grant registry path)`
    );
  }
  writeAssert(absPath, agentId, logical);
}

/** Grant check + short exclusive lease for agent canonical writes. */
export function wrapCanonicalWrite<T>(absPath: string, fn: () => T): T {
  assertEventsWriteAuthorized(absPath);
  if (isFsGuardInternal()) return fn();
  const logical = normalizeLogicalPath(toLogicalPath(absPath));
  const pathClass = classifyCanonicalLogicalPath(logical);
  if (pathClass === "platform") return fn();
  assertFsGuardProdReady({ logicalPath: logical });
  const agentId = getFsGuardAgent();
  if (agentId && pathClass === "agent_forbidden") {
    throw new FsGuardError(
      "agent_forbidden",
      `Agent ${agentId} cannot write ${logical} (RBAC / grant registry path)`
    );
  }
  if (pathClass === "gated") {
    assertFsGuardCanonicalWrite(absPath);
    if (agentId && isFsGuardEnforced()) {
      return withCanonicalLease(logical, agentId, fn);
    }
  }
  return fn();
}
