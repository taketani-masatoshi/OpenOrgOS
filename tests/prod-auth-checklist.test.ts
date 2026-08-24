import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  assertProdAuthReady,
  runProdAuthChecks,
} from "../src/lib/console-auth/prod-checklist.js";
import { collectDoctorChecks } from "../src/commands/doctor.js";

describe("prod auth checklist", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("warns when auth disabled", () => {
    process.env.STEWARD_CHAT_AUTH = "0";
    const checks = runProdAuthChecks("chat");
    expect(checks.find((c) => c.id === "chat_auth_enabled")?.warn).toBe(true);
  });

  it("warns on public host without secure cookie", () => {
    process.env.STEWARD_CHAT_HOST = "chat.example.com";
    delete process.env.ORGOS_COOKIE_SECURE;
    delete process.env.STEWARD_CHAT_SECURE;
    const checks = runProdAuthChecks("chat");
    expect(checks.find((c) => c.id === "secure_cookie")?.warn).toBe(true);
  });

  it("blocks startup in production when auth disabled", () => {
    process.env.ORGOS_ENV = "production";
    process.env.STEWARD_CHAT_AUTH = "0";
    process.env.ORGOS_CSRF = "1";
    delete process.env.ORGOS_CHAT_AUDIT;
    delete process.env.WIRE_CONSOLE_DEV_PASSKEY;
    delete process.env.ORGOS_SESSION_PERSIST;
    delete process.env.ORGOS_LLM_MOCK;
    expect(() => assertProdAuthReady("chat")).toThrow(/authentication disabled/);
  });

  it("blocks startup when CSRF disabled in production", () => {
    process.env.ORGOS_ENV = "production";
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_CSRF = "0";
    delete process.env.WIRE_CONSOLE_DEV_PASSKEY;
    delete process.env.ORGOS_SESSION_PERSIST;
    delete process.env.ORGOS_LLM_MOCK;
    expect(() => assertProdAuthReady("chat")).toThrow(/ORGOS_CSRF=0/);
  });

  it("blocks startup when rate limit disabled in production", () => {
    process.env.ORGOS_ENV = "production";
    process.env.STEWARD_CHAT_AUTH = "1";
    delete process.env.ORGOS_CSRF;
    delete process.env.ORGOS_RATE_LIMIT;
    delete process.env.WIRE_CONSOLE_DEV_PASSKEY;
    delete process.env.ORGOS_SESSION_PERSIST;
    delete process.env.ORGOS_LLM_MOCK;
    process.env.ORGOS_RATE_LIMIT = "0";
    expect(() => assertProdAuthReady("chat")).toThrow(/ORGOS_RATE_LIMIT=0/);
  });

  it("blocks startup when Wire Console auth is not prod", () => {
    process.env.ORGOS_ENV = "production";
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.WIRE_CONSOLE_AUTH = "dev";
    delete process.env.ORGOS_CSRF;
    delete process.env.WIRE_CONSOLE_DEV_PASSKEY;
    delete process.env.ORGOS_SESSION_PERSIST;
    delete process.env.ORGOS_LLM_MOCK;
    expect(() => assertProdAuthReady("wire")).toThrow(/WIRE_CONSOLE_AUTH must be prod/);
  });

  it("blocks startup when WebAuthn origin missing in production wire mode", () => {
    process.env.ORGOS_ENV = "production";
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "operator.example.com";
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN;
    delete process.env.ORGOS_CSRF;
    delete process.env.WIRE_CONSOLE_DEV_PASSKEY;
    delete process.env.ORGOS_SESSION_PERSIST;
    delete process.env.ORGOS_LLM_MOCK;
    delete process.env.ORGOS_MCP_AUTH;
    process.env.ORGOS_MCP_TOKEN = "test-token";
    expect(() => assertProdAuthReady("all")).toThrow(/WIRE_CONSOLE_WEBAUTHN_ORIGIN/);
  });

  it("blocks startup when LLM write tools are enabled in production", () => {
    process.env.ORGOS_ENV = "production";
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_LLM_TOOLS_WRITE = "1";
    delete process.env.ORGOS_CSRF;
    delete process.env.WIRE_CONSOLE_DEV_PASSKEY;
    delete process.env.ORGOS_SESSION_PERSIST;
    delete process.env.ORGOS_LLM_MOCK;
    const checks = runProdAuthChecks("all");
    expect(checks.find((c) => c.id === "llm_tools_write_disabled")?.ok).toBe(false);
    expect(() => assertProdAuthReady("chat")).toThrow(/ORGOS_LLM_TOOLS_WRITE=1/);
  });

  it("surfaces LLM write tools in doctor checks", () => {
    process.env.ORGOS_ENV = "production";
    process.env.ORGOS_LLM_TOOLS_WRITE = "1";
    const { checks } = collectDoctorChecks();
    expect(checks.find((c) => c.id === "llm_tools_write_disabled")?.ok).toBe(false);
  });

  it("fails production when settlement challenge secret missing", () => {
    process.env.ORGOS_ENV = "production";
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "operator.example.com";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "https://operator.example.com";
    delete process.env.ORGOS_SETTLEMENT_CHALLENGE_SECRET;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET;
    delete process.env.WIRE_CONSOLE_DEV_PASSKEY;
    delete process.env.ORGOS_CSRF;
    const checks = runProdAuthChecks("all");
    expect(checks.find((c) => c.id === "settlement_challenge_secret")?.ok).toBe(false);
  });

  it("fails production when webauthn test secret enabled", () => {
    process.env.ORGOS_ENV = "production";
    process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET = "leak";
    const checks = runProdAuthChecks("all");
    expect(checks.find((c) => c.id === "webauthn_test_secret_disabled")?.ok).toBe(false);
  });
});
