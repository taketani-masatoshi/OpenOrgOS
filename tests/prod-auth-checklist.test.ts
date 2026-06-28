import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  assertProdAuthReady,
  runProdAuthChecks,
} from "../src/lib/console-auth/prod-checklist.js";

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
});
