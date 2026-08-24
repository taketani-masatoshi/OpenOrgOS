import { afterEach, describe, expect, it } from "vitest";
import { existsSync, statSync, unlinkSync } from "node:fs";
import {
  clearWebAuthnCredentialsMemoryOverrideForTests,
  resetWebAuthnCredentialsForTests,
  saveWebAuthnCredential,
} from "../src/lib/wire-console/auth/webauthn-store.js";
import { WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH } from "../src/lib/wire-console/paths.js";
import { ensureOrgOsStateDir } from "../src/lib/wire-console/paths.js";

describe("webauthn credential store prod hygiene", () => {
  afterEach(() => {
    resetWebAuthnCredentialsForTests();
    try {
      unlinkSync(WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH);
    } catch {
      /* ok */
    }
  });

  it("writes credential store with mode 0600", () => {
    delete process.env.WIRE_CONSOLE_WEBAUTHN_CREDENTIALS;
    clearWebAuthnCredentialsMemoryOverrideForTests();
    ensureOrgOsStateDir();
    saveWebAuthnCredential({
      credential_id: "cred-mode-test",
      public_key_spki_base64: "dummy",
      operator_id: "OP-001",
      approver_id: "Demo CEO",
      sign_count: 0,
      purpose: "login",
      rp_id: "localhost",
      authenticator_attachment: "platform",
    });
    expect(existsSync(WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH)).toBe(true);
    const mode = statSync(WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
