import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { setTenantId } from "../src/lib/tenant.js";
import { slackChatPort } from "../src/lib/integrations/compat-ports.js";
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
import { discoverKeycloak } from "../src/lib/integrations/sovereign/keycloak-oidc.js";
import { sendMatrixMessage } from "../src/lib/integrations/sovereign/matrix-client.js";
import {
  assertOpenDeskFilePath,
  putNextcloudFile,
} from "../src/lib/integrations/sovereign/nextcloud-webdav.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("opendesk ports", () => {
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

  it("posts a Matrix message through the client API", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      calls.push(String(url));
      return jsonResponse({ event_id: "$ok" });
    }) as typeof fetch;
    const result = await sendMatrixMessage(
      { baseUrl: "http://matrix.local", accessToken: "token", roomId: "!room:localhost" },
      "opendesk verify",
      { fetchImpl, txnId: "txn-1" },
    );
    expect(result.ok).toBe(true);
    expect(calls[0]).toContain("/_matrix/client/v3/rooms/");
    expect(calls[0]).toContain("txn-1");
  });

  it("puts an allowlisted file to Nextcloud and rejects data/", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" });
      return new Response("", { status: 201 });
    }) as typeof fetch;
    const result = await putNextcloudFile(
      { baseUrl: "http://cloud.local", user: "admin", password: "secret" },
      "opendesk-verify/l1-note.txt",
      "opendesk verify",
      fetchImpl,
    );
    expect(result.ok).toBe(true);
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url).toContain("/remote.php/dav/files/admin/opendesk-verify/l1-note.txt");
    expect(() => assertOpenDeskFilePath("data/finance/bank-accounts.yaml")).toThrow(/not exportable/);
  });

  it("reads Keycloak discovery and stops at the issuer", async () => {
    const fetchImpl = (async (url: string | URL) => {
      expect(String(url)).toContain("/realms/master/.well-known/openid-configuration");
      return jsonResponse({ issuer: "http://kc.local/realms/master" });
    }) as typeof fetch;
    const result = await discoverKeycloak({ baseUrl: "http://kc.local", realm: "master" }, fetchImpl);
    expect(result.ok).toBe(true);
  });

  it("still sends Slack through the compat chat port", async () => {
    saveConnectorToken({
      version: 1,
      provider: "slack",
      access_token: "xoxb-1",
      token_type: "Bearer",
      connected_via: "community",
    });
    saveConnectorSettings("slack", { default_channel_id: "C123" });
    const fetchImpl = (async () => jsonResponse({ ok: true })) as typeof fetch;
    const result = await slackChatPort(fetchImpl).send({ text: "hello" });
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("ok");
  });
});
