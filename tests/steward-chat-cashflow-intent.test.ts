import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleCashflowChatMessage,
} from "../src/lib/jp-bank-corporate/cashflow-chat-intent.js";
import {
  isCashflowChatIntent,
  parseCashflowChatIntent,
} from "../src/lib/jp-bank-corporate/cashflow-request.js";
import {
  startStewardChatServer,
  type StewardChatServerHandle,
} from "../src/lib/steward-chat/server.js";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";
import { setTenantId } from "../src/lib/tenant.js";
import {
  registerSession,
  resetSessionsForTests,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

describe("cashflow chat intent parser", () => {
  it.each([
    ["資金繰り表を出して", "weekly", "13w", "md", false],
    ["13週資金繰りを生成", "weekly", "13w", "md", false],
    ["日次90日", "daily", "90d", "md", false],
    ["月次3か月", "monthly", "3m", "md", false],
    ["cashflow weekly 8 weeks as CSV", "weekly", "8w", "csv", false],
    ["13週資金繰りを保存して", "weekly", "13w", "md", true],
    ["cash flow monthly 3 months write JSON", "monthly", "3m", "json", true],
  ])(
    "parses %s",
    (message, granularity, horizon, format, write) => {
      const parsed = parseCashflowChatIntent(message);
      expect(parsed).toMatchObject({
        intent: true,
        ok: true,
        request: { granularity, horizon, format, write },
      });
    }
  );

  it("does not match unrelated conversation", () => {
    expect(isCashflowChatIntent("こんにちは。今日の予定は？")).toBe(false);
    expect(parseCashflowChatIntent("一般的な経営相談です")).toEqual({ intent: false });
  });

  it.each([
    ["日次367日の資金繰り", "366d"],
    ["週次53週の資金繰り", "52w"],
    ["月次25か月の資金繰り", "24m"],
  ])("rejects an excessive horizon: %s", (message, limit) => {
    const parsed = parseCashflowChatIntent(message);
    expect(parsed).toMatchObject({ intent: true, ok: false });
    expect(parsed.intent && !parsed.ok ? parsed.error : "").toContain(limit);
  });

  it("rejects mismatched granularity and horizon units", () => {
    expect(parseCashflowChatIntent("日次13週の資金繰り")).toMatchObject({
      intent: true,
      ok: false,
    });
  });
});

describe("cashflow chat deterministic handler", () => {
  it("uses the shared operator tool in preview mode and whitelists L1 fields", async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      content: JSON.stringify({
        summary: "Cashflow schedule preview generated.",
        path: "tenants/demo/docs/finance/treasury/cashflow-schedule/preview.md",
        shortfall_date: null,
        runway_days: 90,
        required_funding_amount: 123,
        required_funding_by_date: "2026-10-01",
        wrote: false,
        rows: [{ account_id: "BANK-999", opening_balance: 99999999 }],
      }),
    });

    const result = await handleCashflowChatMessage(
      "13週資金繰りを生成",
      { operatorId: "OP-002" },
      execute
    );

    expect(execute).toHaveBeenCalledWith(
      "operator_generate_cashflow",
      JSON.stringify({
        granularity: "weekly",
        horizon: "13w",
        format: "md",
        write: false,
      }),
      { operatorId: "OP-002" }
    );
    expect(result).toMatchObject({
      handled: true,
      ok: true,
      structured: { cashflow_wrote: false, cashflow_runway_days: 90 },
    });
    expect(JSON.stringify(result)).not.toMatch(/rows|account_id|BANK-999|opening_balance|99999999/);
  });
});

describe("cashflow intent through Steward Chat HTTP", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };
  const port = 19543;

  beforeEach(() => {
    setTenantId("demo");
    clearOperatorsRegistryCacheForTests();
    resetSessionsForTests();
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
    process.env.ORGOS_LLM_MOCK = "1";
    process.env.ORGOS_LLM_TOOLS_WRITE = "0";
    handle = startStewardChatServer({ host: "127.0.0.1", port });
    baseUrl = handle.url;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    process.env = { ...env };
    clearOperatorsRegistryCacheForTests();
    resetSessionsForTests();
  });

  function operatorCookie(): string {
    const { token } = registerSession({
      operator_id: "OP-002",
      approver_id: "OP-002",
      mode: "prod",
    });
    return `${WIRE_CONSOLE_SESSION_COOKIE}=${token}`;
  }

  function ceoCookie(): string {
    const { token } = registerSession({
      operator_id: "OP-001",
      approver_id: "OP-001",
      mode: "prod",
    });
    return `${WIRE_CONSOLE_SESSION_COOKIE}=${token}`;
  }

  it("handles non-stream preview without invoking the mock LLM", async () => {
    const response = await fetch(`${baseUrl}/chat/v1/message`, {
      method: "POST",
      headers: { Cookie: operatorCookie(), "Content-Type": "application/json" },
      body: JSON.stringify({ message: "資金繰り表を出して" }),
    });
    const body = (await response.json()) as Record<string, unknown>;
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      structured: { cashflow_wrote: false },
    });
    expect(serialized).toContain("cashflow-schedule");
    expect(serialized).not.toMatch(/モック|rows|account_id|BANK-\d+|opening_balance/);
  });

  it("handles stream preview as one deterministic done event", async () => {
    const response = await fetch(`${baseUrl}/chat/v1/message/stream`, {
      method: "POST",
      headers: { Cookie: operatorCookie(), "Content-Type": "application/json" },
      body: JSON.stringify({ message: "日次90日の資金繰りを生成" }),
    });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('"type":"done"');
    expect(text).toContain('"cashflow_wrote":false');
    expect(text).not.toContain('"type":"delta"');
    expect(text).not.toMatch(/モック|rows|account_id|BANK-\d+|opening_balance/);
  });

  it("leaves unrelated conversation to the LLM path", async () => {
    const response = await fetch(`${baseUrl}/chat/v1/message`, {
      method: "POST",
      headers: { Cookie: operatorCookie(), "Content-Type": "application/json" },
      body: JSON.stringify({ message: "こんにちは" }),
    });
    expect(await response.text()).toContain("モック");
  });

  it("enforces write RBAC and lets an authorized CEO persist the generated artifact", async () => {
    process.env.ORGOS_LLM_TOOLS_WRITE = "1";
    const request = { message: "13週資金繰りをJSONで保存して" };

    const deniedResponse = await fetch(`${baseUrl}/chat/v1/message`, {
      method: "POST",
      headers: { Cookie: operatorCookie(), "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const denied = (await deniedResponse.json()) as Record<string, unknown>;
    expect(deniedResponse.status).toBe(200);
    expect(denied.ok).toBe(false);
    expect(JSON.stringify(denied)).toContain("git:write");

    const previewResponse = await fetch(`${baseUrl}/chat/v1/message`, {
      method: "POST",
      headers: { Cookie: ceoCookie(), "Content-Type": "application/json" },
      body: JSON.stringify({ message: "13週資金繰りをJSONで出して" }),
    });
    const preview = (await previewResponse.json()) as {
      structured: { cashflow_path: string };
    };
    const outputPath = resolve(process.cwd(), preview.structured.cashflow_path);
    const previous = existsSync(outputPath) ? readFileSync(outputPath, "utf-8") : undefined;

    try {
      const allowedResponse = await fetch(`${baseUrl}/chat/v1/message`, {
        method: "POST",
        headers: { Cookie: ceoCookie(), "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const allowed = (await allowedResponse.json()) as {
        ok: boolean;
        structured: { cashflow_wrote: boolean; cashflow_path: string };
      };
      expect(allowedResponse.status).toBe(200);
      expect(allowed).toMatchObject({
        ok: true,
        structured: { cashflow_wrote: true },
      });
      expect(allowed.structured.cashflow_path).toBe(preview.structured.cashflow_path);
      expect(existsSync(outputPath)).toBe(true);
      expect(JSON.stringify(allowed)).not.toMatch(/rows|account_id|BANK-\d+|opening_balance/);
    } finally {
      if (previous === undefined) rmSync(outputPath, { force: true });
      else writeFileSync(outputPath, previous, "utf-8");
    }
  });
});
