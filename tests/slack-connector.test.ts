import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { setTenantId } from "../src/lib/tenant.js";
import { sendConsoleSlackMessage } from "../src/lib/integrations/slack-connector.js";
import {
  connectorTokenPath,
  connectorsFilePath,
  saveConnectorSettings,
  saveConnectorToken,
} from "../src/lib/integrations/connector-store.js";
import {
  connectorSecretsFilePath,
  resetConnectorSecretsHydrationForTest,
} from "../src/lib/integrations/connector-secrets-store.js";

describe("slack connector", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    resetConnectorSecretsHydrationForTest();
    delete process.env.ORGOS_SLACK_WEBHOOK_URL;
  });

  afterEach(() => {
    for (const path of [connectorTokenPath("slack"), connectorsFilePath(), connectorSecretsFilePath()]) {
      if (existsSync(path)) rmSync(path);
    }
    process.env = { ...env };
    resetConnectorSecretsHydrationForTest();
  });

  it("refuses to send when nothing is connected", async () => {
    const result = await sendConsoleSlackMessage({ text: "hello" });
    expect(result.sent).toBe(false);
    expect(result.transport).toBe("none");
  });

  it("refuses to send with a bot token but no channel", async () => {
    saveConnectorToken({
      version: 1,
      provider: "slack",
      access_token: "xoxb-1",
      token_type: "Bearer",
      connected_via: "community",
    });
    const result = await sendConsoleSlackMessage({ text: "hello" });
    expect(result.sent).toBe(false);
    expect(result.transport).toBe("bot_token");
  });

  it("posts to the default channel via chat.postMessage", async () => {
    saveConnectorToken({
      version: 1,
      provider: "slack",
      access_token: "xoxb-1",
      token_type: "Bearer",
      connected_via: "community",
    });
    saveConnectorSettings("slack", { default_channel_id: "C123" });

    const calls: Array<{ url: string; body: unknown }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await sendConsoleSlackMessage({ text: "hello" }, fakeFetch);
    expect(result.sent).toBe(true);
    expect(result.transport).toBe("bot_token");
    expect(calls[0]?.url).toContain("chat.postMessage");
    expect(calls[0]?.body).toMatchObject({ channel: "C123", text: "hello" });
  });

  it("reports the transport without sending on dry run", async () => {
    process.env.ORGOS_SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/x";
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(String(url));
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await sendConsoleSlackMessage({ text: "hi", dryRun: true }, fakeFetch);
    expect(result.dryRun).toBe(true);
    expect(result.sent).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
