import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertLoginPasskeyRegistrationGate,
  assertSettlementPasskeyRegistrationGate,
  authorizeWebAuthnRegistration,
  resolveRegistryRegistrationIdentity,
} from "../src/lib/wire-console/auth/webauthn-register-gate.js";
import {
  resetWebAuthnCredentialsForTests,
  setWebAuthnCredentialsForTests,
} from "../src/lib/wire-console/auth/webauthn-store.js";
import {
  mintPasskeyBootstrapToken,
  resetPasskeyBootstrapStoreForTests,
} from "../src/lib/wire-console/auth/passkey-bootstrap.js";
import { resetWireConsoleTestTenant } from "./helpers/wire-console-test-fixture.js";

describe("webauthn register gate", () => {
  beforeEach(() => {
    resetWireConsoleTestTenant();
    resetWebAuthnCredentialsForTests();
    resetPasskeyBootstrapStoreForTests();
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_OPEN_BOOTSTRAP;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_DISABLE_REGISTER;
    delete process.env.ORGOS_ENV;
  });

  afterEach(() => {
    resetWebAuthnCredentialsForTests();
    resetPasskeyBootstrapStoreForTests();
  });

  it("resolves registry-backed operator identity", () => {
    const resolved = resolveRegistryRegistrationIdentity({
      operator_id: "OP-001",
      approver_id: "Demo CEO",
      purpose: "login",
    });
    expect(resolved).toEqual({ operator_id: "OP-001", approver_id: "Demo CEO" });
  });

  it("rejects unknown operator_id", () => {
    const resolved = resolveRegistryRegistrationIdentity({
      operator_id: "NO-SUCH",
      approver_id: "Demo CEO",
      purpose: "login",
    });
    expect(resolved).toEqual({ error: "unknown operator_id: NO-SUCH" });
  });

  it("requires session for first login passkey bootstrap", () => {
    const gate = assertLoginPasskeyRegistrationGate(undefined);
    expect(gate?.status).toBe(401);
  });

  it("requires bootstrap token in production for first login passkey", () => {
    process.env.ORGOS_ENV = "production";
    const gate = assertLoginPasskeyRegistrationGate(
      { operator_id: "OP-001", approver_id: "Demo CEO", mode: "prod" },
      undefined,
    );
    expect(gate?.status).toBe(401);
  });

  it("allows bootstrap login registration with session and token in production", () => {
    process.env.ORGOS_ENV = "production";
    const { token } = mintPasskeyBootstrapToken({ operatorId: "OP-001" });
    expect(
      assertLoginPasskeyRegistrationGate(
        { operator_id: "OP-001", approver_id: "Demo CEO", mode: "prod" },
        token,
      ),
    ).toBeNull();
  });

  it("allows bootstrap login registration with session", () => {
    expect(
      assertLoginPasskeyRegistrationGate({
        operator_id: "OP-001",
        approver_id: "Demo CEO",
        mode: "prod",
      })
    ).toBeNull();
  });

  it("blocks login registration after bootstrap without session", () => {
    setWebAuthnCredentialsForTests([
      {
        credential_id: "existing",
        public_key_spki_base64: "x",
        operator_id: "OP-001",
        approver_id: "Demo CEO",
        purpose: "login",
      },
    ]);
    const gate = assertLoginPasskeyRegistrationGate(undefined);
    expect(gate?.status).toBe(403);
  });

  it("requires settlement registration session and matching identity", () => {
    expect(assertSettlementPasskeyRegistrationGate(undefined, { operator_id: "OP-001", approver_id: "Demo CEO" })?.status).toBe(401);

    const mismatch = assertSettlementPasskeyRegistrationGate(
      { operator_id: "OP-001", approver_id: "Demo CEO", mode: "prod" },
      { operator_id: "OP-002", approver_id: "秘書" }
    );
    expect(mismatch?.status).toBe(403);

    expect(
      assertSettlementPasskeyRegistrationGate(
        { operator_id: "OP-001", approver_id: "Demo CEO", mode: "prod" },
        { operator_id: "OP-001", approver_id: "Demo CEO" }
      )
    ).toBeNull();
  });

  it("rejects settlement registration for non-approver operator", () => {
    const result = authorizeWebAuthnRegistration(
      { operator_id: "OP-002", approver_id: "秘書オペレータ", purpose: "settlement" },
      { operator_id: "OP-002", approver_id: "秘書オペレータ", mode: "prod" }
    );
    expect(result).toMatchObject({
      error: expect.stringContaining("not permitted to register a settlement passkey"),
      status: 403,
    });
  });
});
