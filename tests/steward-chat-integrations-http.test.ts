import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import {
  connectorTokenPath,
  connectorsFilePath,
} from "../src/lib/integrations/connector-store.js";
import {
  connectorSecretsFilePath,
  resetConnectorSecretsHydrationForTest,
} from "../src/lib/integrations/connector-secrets-store.js";

/**
 * Connectors are the console's only outbound door, so the HTTP surface is
 * checked for the four things that keep it shut: no session, no approval
 * right, no shipping flag, and no way to read a stored secret back.
 */
describe("steward chat integrations HTTP", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  let cookie = "";
  const env = { ...process.env };

  beforeEach(async () => {
    setTenantId("demo");
    resetConnectorSecretsHydrationForTest();
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    process.env.ORGOS_CSRF = "0";
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
    cookie = await login("OP-001");
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    for (const path of [
      connectorTokenPath("slack"),
      connectorsFilePath(),
      connectorSecretsFilePath(),
    ]) {
      if (existsSync(path)) rmSync(path);
    }
    process.env = { ...env };
    resetConnectorSecretsHydrationForTest();
  });

  async function login(operatorId: string): Promise<string> {
    const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passkey: "test-pass",
        operator_id: operatorId,
        approver_id: operatorId,
      }),
    });
    expect(res.status, await res.text()).toBe(200);
    return res.headers.get("set-cookie") ?? "";
  }

  it("requires a session to read the hub", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/integrations`);
    expect(res.status).toBe(401);
  });

  it("lists every provider with its shipping state", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/integrations`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      connectors: Array<{ provider: string; platform_ready: boolean }>;
    };
    expect(body.connectors.map((c) => c.provider).sort()).toEqual([
      "asana",
      "gdrive",
      "gmail",
      "slack",
    ]);
  });

  it("refuses to connect a provider the platform has not shipped", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/integrations/slack/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{}",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; platform_ready: boolean };
    expect(body.ok).toBe(false);
    expect(body.platform_ready).toBe(false);
  });

  it("returns 404 for an unknown provider", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/integrations/dropbox/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  it("never returns a stored fallback secret", async () => {
    const put = await fetch(`${baseUrl}/chat/v1/integrations/secrets`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        ORGOS_SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/TOP/SECRET/VALUE",
      }),
    });
    expect(put.status).toBe(200);
    expect(await put.text()).not.toContain("SECRET/VALUE");

    const hub = await fetch(`${baseUrl}/chat/v1/integrations`, { headers: { Cookie: cookie } });
    const text = await hub.text();
    expect(text).toContain("slack_webhook_configured");
    expect(text).not.toContain("SECRET/VALUE");

    const get = await fetch(`${baseUrl}/chat/v1/integrations/secrets`, {
      headers: { Cookie: cookie },
    });
    expect(get.status).not.toBe(200);
  });

  it("requires chat:approve for HTTP outbound export", async () => {
    // OP-002 is a plain operator: it may propose, never send outbound.
    const operator = await login("OP-002");
    process.env.ORGOS_PROD = "1";
    const res = await fetch(`${baseUrl}/chat/v1/integrations/http/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: operator },
      body: JSON.stringify({ kind: "monthly", id: "2026-05", dry_run: true }),
    });
    expect([401, 403]).toContain(res.status);
  });

  it("includes http_outbound on the hub snapshot", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/integrations`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { http_outbound?: { enabled: boolean } };
    expect(body.http_outbound).toBeDefined();
    expect(typeof body.http_outbound?.enabled).toBe("boolean");
  });

  it("refuses to post to Slack while it is unconnected", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/integrations/slack/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { ok: boolean; transport: string };
    expect(body.ok).toBe(false);
    expect(body.transport).toBe("none");
  });

  it("requires a session to post to Slack", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/integrations/slack/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(res.status).toBe(401);
  });

  it("refuses to push to Asana while it is unconnected", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/integrations/asana/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ kind: "executive_task", id: "TASK-001" }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("refuses a Drive export while it is unconnected", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/integrations/gdrive/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ kind: "document", id: "data/org/operators.yaml" }),
    });
    expect(res.status).toBe(422);
  });

  it("denies connector changes to an operator without approval rights", async () => {
    // OP-002 is a plain operator: it may propose, never send.
    const operator = await login("OP-002");
    // Dev sessions skip permission checks; only prod mode binds the registry.
    process.env.ORGOS_PROD = "1";
    const res = await fetch(`${baseUrl}/chat/v1/integrations/slack/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: operator },
      body: JSON.stringify({ default_channel_id: "C999" }),
    });
    expect([401, 403]).toContain(res.status);
  });
});
