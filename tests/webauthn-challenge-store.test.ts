import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getOrgOsStateDir } from "../src/lib/wire-console/paths.js";
import {
  consumeWebAuthnChallenge,
  disableWebAuthnChallengeStoreMemoryForTests,
  resetWebAuthnChallengeStoreForTests,
  saveWebAuthnChallenge,
  WebAuthnChallengeStoreCorruptError,
} from "../src/lib/wire-console/auth/webauthn-challenge-store.js";

describe("webauthn challenge store", () => {
  beforeEach(() => {
    disableWebAuthnChallengeStoreMemoryForTests();
    resetWebAuthnChallengeStoreForTests();
  });

  afterEach(() => {
    resetWebAuthnChallengeStoreForTests();
  });

  it("saves and consumes login challenge once", () => {
    saveWebAuthnChallenge({
      kind: "login",
      challenge: "login-chal-1",
      expires_at: Date.now() + 60_000,
    });
    const first = consumeWebAuthnChallenge("login-chal-1", "login");
    expect(first?.kind).toBe("login");
    const second = consumeWebAuthnChallenge("login-chal-1", "login");
    expect(second).toBeNull();
  });

  it("persists register challenge metadata across save/consume", () => {
    saveWebAuthnChallenge({
      kind: "register",
      challenge: "reg-chal-1",
      expires_at: Date.now() + 60_000,
      operator_id: "OP-001",
      approver_id: "Demo CEO",
      purpose: "login",
      rp_id: "localhost",
      bootstrap_token: "pkb_test",
    });
    const consumed = consumeWebAuthnChallenge("reg-chal-1", "register");
    expect(consumed).toMatchObject({
      operator_id: "OP-001",
      bootstrap_token: "pkb_test",
    });
  });

  it("rejects wrong kind", () => {
    saveWebAuthnChallenge({
      kind: "login",
      challenge: "x",
      expires_at: Date.now() + 60_000,
    });
    expect(consumeWebAuthnChallenge("x", "register")).toBeNull();
  });

  it("throws on corrupt JSON when reading from disk", () => {
    disableWebAuthnChallengeStoreMemoryForTests();
    const dir = getOrgOsStateDir();
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "webauthn-challenges.json");
    writeFileSync(path, "{not-json", "utf-8");
    try {
      expect(() =>
        saveWebAuthnChallenge({
          kind: "login",
          challenge: "bad-store",
          expires_at: Date.now() + 60_000,
        }),
      ).toThrow(WebAuthnChallengeStoreCorruptError);
    } finally {
      try {
        unlinkSync(path);
      } catch {
        /* ignore */
      }
      resetWebAuthnChallengeStoreForTests();
    }
  });
});
