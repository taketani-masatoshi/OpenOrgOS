import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import {
  registerSession,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";

describe("steward chat org chart change api", () => {
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

  it("lists proposals for chat:read", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/org/chart/change`, {
      headers: { Cookie: cookieFor("OP-READONLY") },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { proposals: unknown[] };
    expect(Array.isArray(body.proposals)).toBe(true);
  });

  it("rejects apply without chat:approve", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/org/chart/change/apply`, {
      method: "POST",
      headers: {
        Cookie: cookieFor("OP-READONLY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ change_id: "OCH-20260824-001" }),
    });
    expect(res.status).toBe(403);
  });

  it("requires approval_id on propose and a valid change_id on apply", async () => {
    await start();
    const headers = {
      Cookie: cookieFor("OP-001"),
      "Content-Type": "application/json",
    };

    const noApproval = await fetch(`${baseUrl}/chat/v1/org/chart/change/propose`, {
      method: "POST",
      headers,
      body: JSON.stringify({ change: {} }),
    });
    expect(noApproval.status).toBe(422);

    const unknown = await fetch(`${baseUrl}/chat/v1/org/chart/change/apply`, {
      method: "POST",
      headers,
      body: JSON.stringify({ change_id: "OCH-20260824-999" }),
    });
    expect(unknown.status).toBe(422);
  });
});
