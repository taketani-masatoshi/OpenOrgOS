import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  consumePasskeyBootstrapToken,
  mintPasskeyBootstrapToken,
  reservePasskeyBootstrapChallenge,
  resetPasskeyBootstrapStoreForTests,
  verifyPasskeyBootstrapToken,
} from "../src/lib/wire-console/auth/passkey-bootstrap.js";

describe("passkey bootstrap token", () => {
  beforeEach(() => {
    resetPasskeyBootstrapStoreForTests();
    delete process.env.ORGOS_ENV;
  });

  afterEach(() => {
    resetPasskeyBootstrapStoreForTests();
  });

  it("mints and verifies token for operator", () => {
    const { token } = mintPasskeyBootstrapToken({ operatorId: "OP-001", ttl: "1h" });
    expect(token.startsWith("pkb_")).toBe(true);
    const verified = verifyPasskeyBootstrapToken(token, "OP-001");
    expect(verified.ok).toBe(true);
  });

  it("rejects wrong operator", () => {
    const { token } = mintPasskeyBootstrapToken({ operatorId: "OP-001" });
    const verified = verifyPasskeyBootstrapToken(token, "OP-002");
    expect(verified.ok).toBe(false);
  });

  it("consumes token once", () => {
    const { token } = mintPasskeyBootstrapToken({ operatorId: "OP-001" });
    const challenge = "test-challenge";
    reservePasskeyBootstrapChallenge({
      token,
      operatorId: "OP-001",
      challenge,
    });
    const consumed = consumePasskeyBootstrapToken({
      token,
      operatorId: "OP-001",
      challenge,
    });
    expect(consumed.ok).toBe(true);
    const again = verifyPasskeyBootstrapToken(token, "OP-001");
    expect(again.ok).toBe(false);
  });

  it("requires reserve before consume in production", () => {
    process.env.ORGOS_ENV = "production";
    const { token } = mintPasskeyBootstrapToken({ operatorId: "OP-001" });
    const consumed = consumePasskeyBootstrapToken({
      token,
      operatorId: "OP-001",
      challenge: "unreserved-challenge",
    });
    expect(consumed.ok).toBe(false);
    if (consumed.ok) throw new Error("expected failure");
    expect(consumed.error).toContain("reserved");
  });
});
