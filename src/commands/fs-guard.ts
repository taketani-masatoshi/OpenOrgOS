import { readFileSync } from "node:fs";
import type { FsGuardOp } from "../../schemas/org/fs-guard.js";
import { requireCliOperator } from "../lib/console-auth/cli-operator.js";
import { isOperatorAuthRequired } from "../lib/console-auth/operator-rbac.js";
import {
  applyAgentWrite,
  currentCanonicalSha256,
  checkAgentWritePolicy,
  deriveGrantsFromEvents,
  ensureIssuer,
  FsGuardError,
  isFsGuardInitialized,
  issueGrant,
  keygenAgent,
  loadGrantEvents,
  loadIdentities,
  revokeGrant,
  seedGrantsFromCatalog,
} from "../lib/org/fs-guard/index.js";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function fail(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  console.error(err instanceof FsGuardError ? `✗ ${message}` : message);
  process.exit(1);
}

function requireGrantAdmin(command: string): string {
  if (!isOperatorAuthRequired()) return "dev-bypass";
  const auth = requireCliOperator({ permission: "guard:admin", command });
  return auth.record.operator_id;
}

export function runGuardInit(opts: { seed?: boolean; json?: boolean }): void {
  try {
    const issuedBy = requireGrantAdmin("guard init");
    const identities = ensureIssuer();
    let seeded: { agents: string[]; grants: number } | undefined;
    if (opts.seed) {
      seeded = seedGrantsFromCatalog({ issuedBy });
    }
    const result = {
      ok: true,
      issuer_key_id: identities.issuer.key_id,
      agents: identities.agents.length,
      seeded,
    };
    if (opts.json) printJson(result);
    else {
      console.log(`✓ FS-guard issuer ${identities.issuer.key_id}`);
      if (seeded) {
        console.log(`  Seeded ${seeded.grants} grants for ${seeded.agents.length} agents`);
      }
      console.log("  Agent private keys stay on this host (LLM must not see them).");
    }
  } catch (err) {
    fail(err);
  }
}

export function runGuardKeygen(opts: { agent: string; rotate?: boolean; json?: boolean }): void {
  try {
    requireGrantAdmin("guard keygen");
    const result = keygenAgent(opts.agent, { rotate: opts.rotate });
    if (opts.json) printJson({ ok: true, ...result });
    else console.log(`✓ ${result.agent_id} key_id ${result.key_id}\n  ${result.key_path}`);
  } catch (err) {
    fail(err);
  }
}

export function runGuardGrant(opts: {
  agent: string;
  path: string;
  op?: string;
  expires?: string;
  reason?: string;
  json?: boolean;
}): void {
  try {
    const issuedBy = requireGrantAdmin("guard grant");
    const grant = issueGrant({
      agentId: opts.agent,
      op: (opts.op === "read" ? "read" : "write") as FsGuardOp,
      pathPattern: opts.path,
      issuedBy,
      expiresAt: opts.expires,
      reason: opts.reason,
    });
    if (opts.json) printJson({ ok: true, grant });
    else console.log(`✓ ${grant.grant_id} ${grant.agent_id} ${grant.op} ${grant.path_pattern}`);
  } catch (err) {
    fail(err);
  }
}

export function runGuardRevoke(opts: { id: string; reason?: string; json?: boolean }): void {
  try {
    const issuedBy = requireGrantAdmin("guard revoke");
    const grant = revokeGrant({ grantId: opts.id, issuedBy, reason: opts.reason });
    if (opts.json) printJson({ ok: true, grant });
    else console.log(`✓ revoked ${grant.grant_id}`);
  } catch (err) {
    fail(err);
  }
}

export function runGuardList(opts: { json?: boolean; agent?: string }): void {
  try {
    const identities = loadIdentities();
    if (!identities || !isFsGuardInitialized()) {
      throw new FsGuardError("not_initialized", "FS-guard is not initialized — run: orgos guard init");
    }
    const grants = deriveGrantsFromEvents(loadGrantEvents(), identities.issuer.public_key);
    const rows = opts.agent ? grants.filter((g) => g.agent_id === opts.agent) : grants;
    if (opts.json) {
      printJson({
        ok: true,
        issuer_key_id: identities.issuer.key_id,
        agents: identities.agents,
        grants: rows,
      });
      return;
    }
    console.log(`issuer ${identities.issuer.key_id}`);
    for (const agent of identities.agents) {
      console.log(`  ${agent.agent_id}  ${agent.status}  ${agent.key_id}`);
    }
    if (!rows.length) {
      console.log("  (no grants)");
      return;
    }
    for (const grant of rows) {
      console.log(`  ${grant.grant_id}  ${grant.status}  ${grant.agent_id}  ${grant.op}  ${grant.path_pattern}`);
    }
  } catch (err) {
    fail(err);
  }
}

export function runGuardCheck(opts: { agent: string; path: string; op?: string; json?: boolean }): void {
  try {
    const result = checkAgentWritePolicy(opts.agent, opts.path, opts.op === "read" ? "read" : "write");
    if (opts.json) {
      printJson(result);
      if (!result.allowed) process.exit(1);
      return;
    }
    if (result.allowed) console.log(`✓ allowed ${result.grant_id ?? ""}`.trim());
    else {
      console.error(`✗ ${result.reason}`);
      process.exit(1);
    }
  } catch (err) {
    fail(err);
  }
}

export function runGuardHash(opts: { path: string; json?: boolean }): void {
  try {
    const sha256 = currentCanonicalSha256(opts.path);
    if (opts.json) printJson({ ok: true, path: opts.path, sha256 });
    else console.log(sha256);
  } catch (err) {
    fail(err);
  }
}

export function runGuardApply(opts: {
  agent: string;
  path: string;
  from: string;
  runId?: string;
  expectedSha256?: string;
  json?: boolean;
}): void {
  try {
    if (!opts.expectedSha256) {
      const current = currentCanonicalSha256(opts.path);
      console.error(
        `✗ CAS --expected-sha256 is required\n  current ${opts.path}: ${current}\n  new file: sha256 of empty string`
      );
      process.exit(1);
    }
    const content = readFileSync(opts.from);
    const result = applyAgentWrite({
      agentId: opts.agent,
      path: opts.path,
      content,
      runId: opts.runId,
      expectedSha256: opts.expectedSha256,
    });
    if (opts.json) printJson({ ok: true, ...result });
    else console.log(`✓ wrote ${result.path} (${result.grant_id ?? "granted"})`);
  } catch (err) {
    fail(err);
  }
}
