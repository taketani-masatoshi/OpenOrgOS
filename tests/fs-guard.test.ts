import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateFsGuardKeyPair, signPayload, verifyPayload } from "../src/lib/org/fs-guard/crypto.js";
import {
  applyAgentWrite,
  checkAgentWritePolicy,
  deriveGrantsFromEvents,
  ensureIssuer,
  FsGuardError,
  isAgentCanonicalLogicalPath,
  isAgentForbiddenPath,
  isFsGuardPlatformPath,
  issueGrant,
  keygenAgent,
  loadGrantEvents,
  loadIdentities,
  revokeGrant,
  runWithFsGuardAgent,
  setFsGuardPathsForTests,
  sha256Hex,
  type FsGuardPaths,
} from "../src/lib/org/fs-guard/index.js";
import { setTenantId, tenantDataPath } from "../src/lib/tenant.js";
import { writeYamlFile } from "../src/lib/utils.js";
import {
  makeFsGuardPathsForTests,
  removeFsGuardPathsForTests,
} from "./helpers/fs-guard-store-fixture.js";

describe("fs-guard", () => {
  let store: FsGuardPaths;

  beforeEach(() => {
    setTenantId("demo");
    store = makeFsGuardPathsForTests();
    setFsGuardPathsForTests(store);
    delete process.env.ORGOS_FS_GUARD;
  });

  afterEach(() => {
    setFsGuardPathsForTests(undefined);
    delete process.env.ORGOS_FS_GUARD;
    delete process.env.ORGOS_FS_GUARD_AGENT;
    removeFsGuardPathsForTests(store);
  });

  it("creates an issuer whose public key is recorded without the private key", () => {
    const identities = ensureIssuer(store);
    expect(identities.issuer.public_key.length).toBeGreaterThan(32);
    expect(readFileSync(store.issuerKeyPath, "utf-8")).toContain("PRIVATE KEY");
    expect(readFileSync(store.identitiesPath, "utf-8")).not.toContain("PRIVATE KEY");
  });

  it("allows finance writes only under a signed finance grant", () => {
    ensureIssuer(store);
    keygenAgent("finance", { paths: store });
    issueGrant({
      agentId: "finance",
      op: "write",
      pathPattern: "data/finance/**",
      issuedBy: "test",
      paths: store,
    });
    expect(checkAgentWritePolicy("finance", "data/finance/cash-balance.yaml", "write", store).allowed).toBe(
      true
    );
    expect(checkAgentWritePolicy("finance", "data/contracts/CTR-001.yaml", "write", store).allowed).toBe(
      false
    );
  });

  it("denies classified paths even when a grant is too broad", () => {
    ensureIssuer(store);
    keygenAgent("contract", { paths: store });
    issueGrant({
      agentId: "contract",
      op: "write",
      pathPattern: "data/finance/**",
      issuedBy: "test",
      paths: store,
    });
    const result = checkAgentWritePolicy(
      "contract",
      "data/finance/bank-accounts.yaml",
      "write",
      store
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/権限なし|max_level/);
  });

  it("rejects a grant event whose issuer signature was forged", () => {
    ensureIssuer(store);
    keygenAgent("finance", { paths: store });
    issueGrant({
      agentId: "finance",
      op: "write",
      pathPattern: "data/finance/**",
      issuedBy: "test",
      paths: store,
    });
    const events = loadGrantEvents(store);
    const forged = { ...events[0]!, signature: "AAAA" };
    const identities = loadIdentities(store)!;
    expect(() => deriveGrantsFromEvents([forged], identities.issuer.public_key)).toThrow(/signature/);
  });

  it("stops writes after revoke", () => {
    ensureIssuer(store);
    keygenAgent("contract", { paths: store });
    const grant = issueGrant({
      agentId: "contract",
      op: "write",
      pathPattern: "data/contracts/**",
      issuedBy: "test",
      paths: store,
    });
    expect(checkAgentWritePolicy("contract", "data/contracts/CTR-001.yaml", "write", store).allowed).toBe(
      true
    );
    revokeGrant({ grantId: grant.grant_id, issuedBy: "test", paths: store });
    expect(checkAgentWritePolicy("contract", "data/contracts/CTR-001.yaml", "write", store).allowed).toBe(
      false
    );
  });

  it("applies a signed finance write and refuses a path outside the grant", () => {
    ensureIssuer(store);
    keygenAgent("finance", { paths: store });
    issueGrant({
      agentId: "finance",
      op: "write",
      pathPattern: "docs/reports/agent-summaries/finance/**",
      issuedBy: "test",
      paths: store,
    });
    const dest = "docs/reports/agent-summaries/finance/_fs-guard-test.md";
    const empty = sha256Hex("");
    const result = applyAgentWrite({
      agentId: "finance",
      path: dest,
      content: "ok\n",
      expectedSha256: empty,
      paths: store,
    });
    expect(result.path).toBe(dest);
    expect(readFileSync(join(process.cwd(), "tenants/demo", dest), "utf-8")).toBe("ok\n");
    const written = join(process.cwd(), "tenants/demo", dest);
    if (existsSync(written)) unlinkSync(written);
    expect(() =>
      applyAgentWrite({
        agentId: "finance",
        path: "data/contracts/CTR-001.yaml",
        content: "nope\n",
        expectedSha256: empty,
        paths: store,
      })
    ).toThrow(FsGuardError);
  });

  it("rejects src/ grants and path traversal", () => {
    ensureIssuer(store);
    keygenAgent("engineering", { paths: store });
    expect(() =>
      issueGrant({
        agentId: "engineering",
        op: "write",
        pathPattern: "src/**",
        issuedBy: "test",
        paths: store,
      })
    ).toThrow(/data\/, docs\//);
    expect(checkAgentWritePolicy("engineering", "data/../src/cli.ts", "write", store).allowed).toBe(false);
  });

  it("verifies intent signatures against the agent public key", () => {
    const agent = generateFsGuardKeyPair();
    const other = generateFsGuardKeyPair();
    const unsigned = { agent_id: "finance", path: "data/finance/x.yaml" };
    const signature = signPayload(unsigned, agent.privateKeyPem);
    expect(verifyPayload(unsigned, signature, agent.publicKey)).toBe(true);
    expect(verifyPayload(unsigned, signature, other.publicKey)).toBe(false);
  });

  it("rejects apply when CAS expected sha256 does not match", () => {
    ensureIssuer(store);
    keygenAgent("finance", { paths: store });
    issueGrant({
      agentId: "finance",
      op: "write",
      pathPattern: "docs/reports/agent-summaries/finance/**",
      issuedBy: "test",
      paths: store,
    });
    const dest = "docs/reports/agent-summaries/finance/_fs-guard-cas.md";
    const written = join(process.cwd(), "tenants/demo", dest);
    applyAgentWrite({
      agentId: "finance",
      path: dest,
      content: "v1\n",
      expectedSha256: sha256Hex(""),
      paths: store,
    });
    try {
      expect(() =>
        applyAgentWrite({
          agentId: "finance",
          path: dest,
          content: "v2\n",
          expectedSha256: sha256Hex("stale\n"),
          paths: store,
        })
      ).toThrow(/CAS mismatch/);
      const ok = applyAgentWrite({
        agentId: "finance",
        path: dest,
        content: "v2\n",
        expectedSha256: sha256Hex("v1\n"),
        paths: store,
      });
      expect(ok.content_sha256).toBe(sha256Hex("v2\n"));
      expect(readFileSync(store.appliesPath, "utf-8")).toMatch(/content_sha256/);
    } finally {
      if (existsSync(written)) unlinkSync(written);
    }
  });

  it("gates writeYamlFile under an agent context and allows human CLI without one", () => {
    ensureIssuer(store);
    keygenAgent("finance", { paths: store });
    issueGrant({
      agentId: "finance",
      op: "write",
      pathPattern: "data/finance/**",
      issuedBy: "test",
      paths: store,
    });
    const dest = tenantDataPath("finance", "_fs-guard-hook-test.yaml");
    try {
      writeYamlFile(dest, { ok: true });
      runWithFsGuardAgent("finance", () => {
        writeYamlFile(dest, { ok: "finance" });
      });
      expect(() =>
        runWithFsGuardAgent("finance", () => {
          writeYamlFile(tenantDataPath("contracts", "_fs-guard-hook-deny.yaml"), { nope: true });
        })
      ).toThrow(/FS-guard blocked YAML write/);
    } finally {
      if (existsSync(dest)) unlinkSync(dest);
    }
  });

  it("requires CAS expected_sha256 on apply", () => {
    ensureIssuer(store);
    keygenAgent("finance", { paths: store });
    issueGrant({
      agentId: "finance",
      op: "write",
      pathPattern: "docs/reports/agent-summaries/finance/**",
      issuedBy: "test",
      paths: store,
    });
    expect(() =>
      applyAgentWrite({
        agentId: "finance",
        path: "docs/reports/agent-summaries/finance/_cas-required.md",
        content: "x\n",
        paths: store,
      })
    ).toThrow(/CAS expected_sha256 is required/);
  });

  it("gates module-messages but classifies platform / forbidden / gated", () => {
    expect(isFsGuardPlatformPath("data/.orgos/canonical-leases.json")).toBe(true);
    expect(isFsGuardPlatformPath("data/scratch/aia-runs/RUN-1/draft.md")).toBe(true);
    expect(isFsGuardPlatformPath("data/org/agent-identities.yaml")).toBe(false);
    expect(isAgentForbiddenPath("data/org/agent-identities.yaml")).toBe(true);
    expect(isAgentForbiddenPath("data/org/operators.yaml")).toBe(true);
    expect(isAgentForbiddenPath("data/org/access-grants.yaml")).toBe(true);
    expect(isAgentForbiddenPath("data/protocol/signing-key.pem")).toBe(true);
    expect(isAgentCanonicalLogicalPath("data/org/module-messages/x.yaml")).toBe(true);
    expect(isAgentCanonicalLogicalPath("data/org/pending-approvals.yaml")).toBe(true);
    expect(isAgentCanonicalLogicalPath("data/org/agent-identities.yaml")).toBe(false);
  });

  it("blocks agent context from writing agent_forbidden paths", () => {
    ensureIssuer(store);
    keygenAgent("finance", { paths: store });
    expect(() =>
      runWithFsGuardAgent("finance", () => {
        writeYamlFile(tenantDataPath("org", "operators.yaml"), { version: "1", operators: [] });
      })
    ).toThrow(/agent_forbidden|cannot write/);
  });

  it("fails closed when another agent holds a canonical lease", async () => {
    const { withCanonicalLease } = await import("../src/lib/org/fs-guard/lease.js");
    process.env.ORGOS_FS_GUARD = "enforce";
    withCanonicalLease("data/finance/cash-balance.yaml", "finance", () => {
      expect(() =>
        withCanonicalLease("data/finance/cash-balance.yaml", "secretary", () => "nope")
      ).toThrow(/leased by finance/);
    });
  });

  it("allows nested same-agent leases and blocks a different run id", async () => {
    const { withCanonicalLease } = await import("../src/lib/org/fs-guard/lease.js");
    process.env.ORGOS_FS_GUARD = "enforce";
    const nested = withCanonicalLease("data/finance/cash-balance.yaml", "finance", () => {
      return withCanonicalLease("data/finance/cash-balance.yaml", "finance", () => "ok");
    });
    expect(nested).toBe("ok");
    withCanonicalLease("data/finance/cash-balance.yaml", "finance", () => {
      expect(() =>
        withCanonicalLease("data/finance/cash-balance.yaml", "finance", () => "nope", "run-b")
      ).toThrow(/leased by finance/);
    }, "run-a");
  });

  it("fails closed when the lease file is corrupt", async () => {
    const { writeFileSync: write } = await import("node:fs");
    const { withCanonicalLease } = await import("../src/lib/org/fs-guard/lease.js");
    write(store.leasesPath, "{not-json", "utf-8");
    expect(() =>
      withCanonicalLease("data/finance/cash-balance.yaml", "finance", () => "nope")
    ).toThrow(/not valid JSON/);
  });
});
