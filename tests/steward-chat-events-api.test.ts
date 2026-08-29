import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import {
  registerSession,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";

describe("steward chat company events api", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("_fixture-books");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
    process.env.ORGOS_CHAT_AUDIT = "0";
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

  function cookieFor(operatorId: string) {
    const { token } = registerSession({
      operator_id: operatorId,
      approver_id: operatorId,
      mode: "prod",
    });
    return `${WIRE_CONSOLE_SESSION_COOKIE}=${token}`;
  }

  it("exposes chain verification to chat:read", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/events/chain/verify`, {
      headers: { Cookie: cookieFor("OP-READONLY") },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: { ok: boolean; chain_checked: number; issues: unknown[] };
    };
    expect(typeof body.report.ok).toBe("boolean");
    expect(Array.isArray(body.report.issues)).toBe(true);
  });

  it("rejects lifecycle actions without events:write", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/events/EVT-UNKNOWN/close`, {
      method: "POST",
      headers: {
        Cookie: cookieFor("OP-READONLY"),
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });

  it("requires a reason to void and 404s unknown events", async () => {
    await start();
    const headers = {
      Cookie: cookieFor("OP-001"),
      "Content-Type": "application/json",
    };
    const missing = await fetch(`${baseUrl}/chat/v1/events/EVT-UNKNOWN/close`, {
      method: "POST",
      headers,
      body: "{}",
    });
    expect(missing.status).toBe(404);

    const created = await fetch(`${baseUrl}/chat/v1/events`, {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "misc", title: "BFF lifecycle test" }),
    });
    expect(created.status).toBe(200);
    const { event } = (await created.json()) as { event: { id: string } };

    const noReason = await fetch(
      `${baseUrl}/chat/v1/events/${event.id}/void`,
      { method: "POST", headers, body: "{}" },
    );
    expect(noReason.status).toBe(422);

    const closed = await fetch(`${baseUrl}/chat/v1/events/${event.id}/close`, {
      method: "POST",
      headers,
      body: "{}",
    });
    expect(closed.status).toBe(200);
    expect(((await closed.json()) as { event: { status: string } }).event.status).toBe(
      "closed",
    );
  });
});
