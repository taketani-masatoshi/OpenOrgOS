import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import { pushQueueEvent } from "../src/lib/queue-db.js";
import { spawnSync } from "node:child_process";
import {
  seedDemoWireDeliveryEnvelope,
} from "./helpers/demo-witness-fixture.js";
import { saveWirePending, enqueueWirePending } from "../src/lib/protocol/wire-queue.js";

describe("steward chat wire flush API", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(async () => {
    setTenantId("demo");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";

    spawnSync("node", ["--import", "tsx", "scripts/seed-demo-wire-skeleton.ts"], {
      cwd: process.cwd(),
      stdio: "pipe",
      env: { ...process.env, ORGOS_TENANT: "demo" },
    });

    const eventId = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
    const digest = seedDemoWireDeliveryEnvelope("demo", eventId);
    saveWirePending({ pending: [] });
    enqueueWirePending({
      peer_id: "PEER-001",
      event_id: eventId,
      envelope_digest: digest,
      last_error: "test wire flush",
    });

    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    process.env = { ...env };
  });

  async function loginCookie(): Promise<string> {
    const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "test-pass" }),
    });
    expect(res.status).toBe(200);
    return res.headers.get("set-cookie") ?? "";
  }

  it("flushes wire pending via chat BFF", async () => {
    const cookie = await loginCookie();
    const flush = await fetch(`${baseUrl}/chat/v1/wire/flush`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(flush.status).toBe(200);
    const body = (await flush.json()) as { flushed: number };
    expect(body.flushed).toBeGreaterThanOrEqual(0);
  });
});
