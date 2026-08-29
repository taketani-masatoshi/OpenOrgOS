import { afterEach, describe, expect, it, beforeEach } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import {
  registerSession,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";

describe("steward chat analytics dashboard api rbac", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("mal");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    process.env = { ...env };
  });

  async function start() {
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  }

  it("returns 401 without session", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/analytics/dashboard`);
    expect(res.status).toBe(401);
  });

  it("allows chat:read users to GET analytics dashboard", async () => {
    await start();
    const { token } = registerSession({
      operator_id: "guest",
      approver_id: "guest-not-authorized",
      mode: "prod",
    });
    const res = await fetch(`${baseUrl}/chat/v1/analytics/dashboard`, {
      headers: { Cookie: `${WIRE_CONSOLE_SESSION_COOKIE}=${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      kpi: { rows: unknown[] };
      data_quality_overall: number | null;
      view_model: { view_id: string };
    };
    expect(body.view_model.view_id).toBe("analytics-dashboard");
    expect(body.kpi.rows.length).toBeGreaterThan(0);
    expect(body).toHaveProperty("data_quality_overall");
  });

  it("answers without running a full-tenant scan", async () => {
    await start();
    const { token } = registerSession({
      operator_id: "guest",
      approver_id: "guest-not-authorized",
      mode: "prod",
    });
    const started = Date.now();
    const res = await fetch(`${baseUrl}/chat/v1/analytics/dashboard`, {
      headers: { Cookie: `${WIRE_CONSOLE_SESSION_COOKIE}=${token}` },
    });
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(15_000);
  });
});
