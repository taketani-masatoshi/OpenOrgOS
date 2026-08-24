import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listPasskeysForSession,
  revokePasskeyForSession,
} from "../src/lib/wire-console/auth/webauthn-credentials-api.js";
import {
  resetWebAuthnCredentialsForTests,
  setWebAuthnCredentialsForTests,
} from "../src/lib/wire-console/auth/webauthn-store.js";
import { resetWireConsoleTestTenant } from "./helpers/wire-console-test-fixture.js";

describe("webauthn credentials api", () => {
  const session = {
    operator_id: "OP-001",
    approver_id: "Demo CEO",
    mode: "prod" as const,
  };

  beforeEach(() => {
    resetWireConsoleTestTenant();
    resetWebAuthnCredentialsForTests();
  });

  afterEach(() => {
    resetWebAuthnCredentialsForTests();
  });

  it("lists passkeys for the signed-in operator only", () => {
    setWebAuthnCredentialsForTests([
      {
        credential_id: "login-1",
        public_key_spki_base64: "x",
        operator_id: "OP-001",
        approver_id: "Demo CEO",
        purpose: "login",
        created_at: "2026-01-01T00:00:00.000Z",
        authenticator_attachment: "platform",
      },
      {
        credential_id: "settle-1",
        public_key_spki_base64: "y",
        operator_id: "OP-001",
        approver_id: "Demo CEO",
        purpose: "settlement",
        authenticator_attachment: "cross-platform",
      },
      {
        credential_id: "other",
        public_key_spki_base64: "z",
        operator_id: "OP-002",
        approver_id: "秘書",
        purpose: "login",
      },
    ]);

    const { credentials } = listPasskeysForSession(session);
    expect(credentials.map((c) => c.credential_id).sort()).toEqual(["login-1", "settle-1"]);
    expect(credentials[0]?.revocable).toBe(true);
  });

  it("revokes an owned passkey", () => {
    setWebAuthnCredentialsForTests([
      {
        credential_id: "login-1",
        public_key_spki_base64: "x",
        operator_id: "OP-001",
        approver_id: "Demo CEO",
        purpose: "login",
      },
    ]);

    expect(revokePasskeyForSession(session, "login-1")).toEqual({ ok: true });
    expect(listPasskeysForSession(session).credentials).toHaveLength(0);
  });

  it("rejects revoking another operator passkey", () => {
    setWebAuthnCredentialsForTests([
      {
        credential_id: "other",
        public_key_spki_base64: "z",
        operator_id: "OP-002",
        approver_id: "秘書",
        purpose: "login",
      },
    ]);

    const result = revokePasskeyForSession(session, "other");
    expect(result).toMatchObject({ error: expect.stringContaining("session"), status: 403 });
  });
});
