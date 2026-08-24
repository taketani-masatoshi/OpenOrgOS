import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { runProdAuthChecks } from "../src/lib/console-auth/prod-checklist.js";
import {
  resetPasskeyBootstrapStoreForTests,
  mintPasskeyBootstrapToken,
} from "../src/lib/wire-console/auth/passkey-bootstrap.js";
import { resetWebAuthnCredentialsForTests } from "../src/lib/wire-console/auth/webauthn-store.js";
import { installFsGuardStoreForTests, type FsGuardStoreFixture } from "./helpers/fs-guard-store-fixture.js";

describe("passkey prod readiness (smoke fixture env)", () => {
  const envSnapshot = { ...process.env };
  let guard: FsGuardStoreFixture;

  beforeAll(() => {
    guard = installFsGuardStoreForTests();
  });

  afterAll(() => {
    guard.cleanup();
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    resetPasskeyBootstrapStoreForTests();
    resetWebAuthnCredentialsForTests();
  });

  it("runProdAuthChecks passes for wire-console webauthn smoke configuration", () => {
    process.env.ORGOS_ENV = "production";
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.WIRE_CONSOLE_PROD_ADAPTER = "webauthn";
    process.env.ORGOS_SESSION_PERSIST = "1";
    process.env.ORGOS_SETTLEMENT_CHALLENGE_SECRET = "prod-readiness-test-secret";
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "localhost";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "http://localhost:9473";
    delete process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_OPEN_BOOTSTRAP;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_CREDENTIALS;
    resetWebAuthnCredentialsForTests();
    mintPasskeyBootstrapToken({ operatorId: "OP-001" });

    const failed = runProdAuthChecks("wire").filter((c) => !c.ok);
    expect(failed.map((c) => c.id)).toEqual([]);
  });
});
