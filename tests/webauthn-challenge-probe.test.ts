import { describe, expect, it } from "vitest";
import { probeWebAuthnChallengeStore, resetWebAuthnChallengeStoreForTests } from "../src/lib/wire-console/auth/webauthn-challenge-store.js";

describe("webauthn challenge store probe", () => {
  it("probe succeeds in memory test mode", () => {
    resetWebAuthnChallengeStoreForTests();
    const probe = probeWebAuthnChallengeStore();
    expect(probe.ok).toBe(true);
    expect(probe.detail).toMatch(/in-memory|read\/write ok/);
  });
});
