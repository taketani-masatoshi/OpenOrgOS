import { describe, it, expect } from "vitest";
import {
  deriveOpenOrgDidFromPublicKey,
  deriveOpenOrgDidFromTenant,
  formatOpenOrgDid,
  isOpenOrgDid,
  parseOpenOrgDid,
} from "../schemas/protocol/openorg-did.js";

describe("openorg-did", () => {
  it("formats tenant-scoped DID", () => {
    expect(deriveOpenOrgDidFromTenant("demo")).toBe("did:ooo:org:demo");
    expect(isOpenOrgDid("did:ooo:org:demo")).toBe(true);
  });

  it("derives pk-prefixed DID from public key", () => {
    const did = deriveOpenOrgDidFromPublicKey("MCowBQYDK2VwAyEAZo2I49g0pttiiJJ2U5qVcRWf3FKqU7HsTsIHft720mM=");
    expect(did).toMatch(/^did:ooo:org:pk-[a-f0-9]{16}$/);
  });

  it("parses did components", () => {
    const parsed = parseOpenOrgDid("did:ooo:org:mal");
    expect(parsed).toEqual({ method: "ooo", namespace: "org", identifier: "mal" });
  });

  it("rejects invalid identifiers", () => {
    expect(() => formatOpenOrgDid("")).toThrow();
    expect(() => formatOpenOrgDid("_bad")).toThrow();
  });
});
