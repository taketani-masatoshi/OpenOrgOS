import { describe, it, expect, afterEach } from "vitest";
import {
  resolveWireNodeDid,
  isPkPrefixedOpenOrgDid,
  isPkDidRequired,
} from "../schemas/protocol/openorg-did.js";
import { assertPinLocalGovernanceApproved } from "../src/lib/protocol/wire-node-governance-gate.js";

describe("pk-DID enforcement", () => {
  const sampleKey =
    "MCowBQYDK2VwAyEAZo2I49g0pttiiJJ2U5qVcRWf3FKqU7HsTsIHft720mM=";

  afterEach(() => {
    delete process.env.ORGOS_REQUIRE_PK_DID;
    delete process.env.ORGOS_STRICT_TRUST;
    delete process.env.ORGOS_REQUIRE_GOVERNANCE_PIN;
    delete process.env.ORGOS_BYPASS_GOVERNANCE;
  });

  it("resolveWireNodeDid returns pk-DID by default for onboarding", () => {
    const did = resolveWireNodeDid({
      publicKeyBase64: sampleKey,
      tenantId: "demo",
      requirePk: true,
    });
    expect(isPkPrefixedOpenOrgDid(did)).toBe(true);
  });

  it("rejects slug configured DID when pk required", () => {
    expect(() =>
      resolveWireNodeDid({
        publicKeyBase64: sampleKey,
        configured: "did:ooo:org:demo",
        requirePk: true,
      })
    ).toThrow(/pk-prefixed/);
  });

  it("isPkDidRequired when ORGOS_STRICT_TRUST=1", () => {
    process.env.ORGOS_STRICT_TRUST = "1";
    expect(isPkDidRequired()).toBe(true);
  });
});

describe("pin-local governance gate", () => {
  afterEach(() => {
    delete process.env.ORGOS_STRICT_TRUST;
    delete process.env.ORGOS_REQUIRE_GOVERNANCE_PIN;
    delete process.env.ORGOS_BYPASS_GOVERNANCE;
  });

  it("blocks unregistered tenant when strict", () => {
    process.env.ORGOS_STRICT_TRUST = "1";
    expect(() => assertPinLocalGovernanceApproved("unknown-tenant-xyz")).toThrow(/pin-local blocked/);
  });

  it("allows mal when in platform registry", () => {
    process.env.ORGOS_STRICT_TRUST = "1";
    expect(() => assertPinLocalGovernanceApproved("mal", { bypass: false })).not.toThrow();
  });
});
