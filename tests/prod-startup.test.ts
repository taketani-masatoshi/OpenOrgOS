import { describe, expect, it, beforeAll, afterEach, afterAll } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startOperatorConsoleServer } from "../src/lib/operator-console/combined-server.js";
import { STEWARD_CHAT_SPA_DIST } from "../src/lib/steward-chat/server.js";
import { assertProdAuthReady } from "../src/lib/console-auth/prod-checklist.js";
import { installFsGuardStoreForTests, type FsGuardStoreFixture } from "./helpers/fs-guard-store-fixture.js";
import { mintPasskeyBootstrapToken } from "../src/lib/wire-console/auth/passkey-bootstrap.js";

describe("prod startup", () => {
  const env = { ...process.env };
  const wireCombined = join(process.cwd(), "apps", "wire-console", "dist-combined");
  let guard: FsGuardStoreFixture;

  beforeAll(() => {
    mkdirSync(STEWARD_CHAT_SPA_DIST, { recursive: true });
    mkdirSync(wireCombined, { recursive: true });
    writeFileSync(join(STEWARD_CHAT_SPA_DIST, "index.html"), "<html></html>");
    writeFileSync(join(wireCombined, "index.html"), "<html></html>");
    guard = installFsGuardStoreForTests();
  });

  afterAll(() => {
    guard.cleanup();
  });

  afterEach(() => {
    process.env = { ...env };
  });

  function setProdEnv(): void {
    process.env.ORGOS_ENV = "production";
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "localhost";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "http://localhost:9470";
    process.env.ORGOS_MCP_TOKEN = "test-mcp-token-for-prod-startup";
    process.env.ORGOS_SETTLEMENT_CHALLENGE_SECRET = "prod-startup-test-settlement-secret";
    mintPasskeyBootstrapToken({ operatorId: "OP-001" });
    delete process.env.WIRE_CONSOLE_DEV_PASSKEY;
    delete process.env.ORGOS_SESSION_PERSIST;
    delete process.env.ORGOS_LLM_MOCK;
    delete process.env.ORGOS_CSRF;
    delete process.env.ORGOS_RATE_LIMIT;
    delete process.env.ORGOS_CHAT_AUDIT;
    delete process.env.ORGOS_MCP_AUTH;
    delete process.env.STEWARD_CHAT_HOST;
    delete process.env.OPERATOR_CONSOLE_HOST;
    delete process.env.ORGOS_SETTLEMENT_RP_ID;
    delete process.env.ORGOS_SETTLEMENT_STEPUP;
  }

  it("passes prod auth checklist with required env", () => {
    setProdEnv();
    expect(() => assertProdAuthReady("all")).not.toThrow();
  });

  it("starts operator console server in production mode", async () => {
    setProdEnv();
    const handle = await startOperatorConsoleServer({ host: "127.0.0.1", port: 0 });
    expect(handle.url).toMatch(/^http:\/\//);
    await new Promise<void>((resolve) => handle.close(resolve));
  });

  it("rejects startup when CSRF disabled in production", () => {
    setProdEnv();
    process.env.ORGOS_CSRF = "0";
    expect(() => assertProdAuthReady("all")).toThrow(/ORGOS_CSRF=0/);
  });
});
