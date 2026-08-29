import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import { communityIntegrationPath } from "../src/lib/protocol/community-integration-flags.js";
import {
  registerSession,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";

describe("steward chat platform ops api", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };
  let originalIntegration = "";

  beforeEach(() => {
    setTenantId("_fixture-books");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
    process.env.ORGOS_CHAT_AUDIT = "0";
    process.env.ORGOS_PLATFORM_OPERATORS = "OP-001";
    // Keep the probe offline and fast.
    process.env.ORGOS_COMMUNITY_URL = "http://127.0.0.1:1";
    originalIntegration = readFileSync(communityIntegrationPath(), "utf-8");
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    writeFileSync(communityIntegrationPath(), originalIntegration, "utf-8");
    process.env = { ...env };
  });

  async function start() {
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  }

  function cookieFor(operatorId: string) {
    const { token } = registerSession({
      operator_id: operatorId,
      approver_id: operatorId,
      mode: "prod",
    });
    return `${WIRE_CONSOLE_SESSION_COOKIE}=${token}`;
  }

  it("hides the platform view from non-platform operators", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/platform/integration`, {
      headers: { Cookie: cookieFor("OP-002") },
    });
    expect(res.status).toBe(403);
  });

  it("gates hub status behind the platform allowlist", async () => {
    await start();
    const denied = await fetch(`${baseUrl}/chat/v1/hub/status`, {
      headers: { Cookie: cookieFor("OP-002") },
    });
    expect(denied.status).toBe(403);

    const res = await fetch(`${baseUrl}/chat/v1/hub/status`, {
      headers: { Cookie: cookieFor("OP-001") },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ga: { checks: unknown[] };
      bind: { allowed: boolean };
      tls: { present: boolean };
    };
    expect(Array.isArray(body.ga.checks)).toBe(true);
    expect(typeof body.bind.allowed).toBe("boolean");
    expect(typeof body.tls.present).toBe("boolean");
  });

  it("reports flags plus the community env probe and flips a flag", async () => {
    await start();
    const headers = {
      Cookie: cookieFor("OP-001"),
      "Content-Type": "application/json",
    };

    const before = await fetch(`${baseUrl}/chat/v1/platform/integration`, { headers });
    expect(before.status).toBe(200);
    const body = (await before.json()) as {
      flags: Record<string, boolean>;
      community_env: { reachable: boolean };
    };
    expect(typeof body.flags.tenant_mail_connect_api).toBe("boolean");
    expect(body.community_env.reachable).toBe(false);

    const bad = await fetch(`${baseUrl}/chat/v1/platform/integration`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ flag: "not_a_flag", value: true }),
    });
    expect(bad.status).toBe(422);

    const put = await fetch(`${baseUrl}/chat/v1/platform/integration`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ flag: "tenant_mail_connect_api", value: true }),
    });
    expect(put.status).toBe(200);
    const after = (await put.json()) as { flags: Record<string, boolean> };
    expect(after.flags.tenant_mail_connect_api).toBe(true);
  });
});
