import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import {
  DEMO_WITNESS_EVENT_ID,
  seedDemoWitnessEnvelope,
  startDemoWitnessHubs,
  type DemoWitnessHubs,
} from "./helpers/demo-witness-fixture.js";
import { enqueueWitnessPending, saveWitnessPending } from "../src/lib/protocol/witness-queue.js";
import { spawnSync } from "node:child_process";

describe("steward chat witness API", () => {
  let handle: StewardChatServerHandle | undefined;
  let witnessHubs: DemoWitnessHubs | undefined;
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

    const digest = seedDemoWitnessEnvelope("demo");
    saveWitnessPending({ pending: [] });
    enqueueWitnessPending({
      hub_id: "HUB-A",
      event_id: DEMO_WITNESS_EVENT_ID,
      side: "sent",
      envelope_digest: digest,
      last_error: "test pending",
    });

    witnessHubs = await startDemoWitnessHubs("demo");
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    witnessHubs?.close();
    witnessHubs = undefined;
    process.env = { ...env };
  });

  async function loginCookie(): Promise<string> {
    const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "test-pass" }),
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toBeTruthy();
    return cookie ?? "";
  }

  it("registers sent/received and verifies quorum via chat BFF", async () => {
    const cookie = await loginCookie();

    for (const side of ["sent", "received"] as const) {
      const register = await fetch(`${baseUrl}/chat/v1/wire/witness/register`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: DEMO_WITNESS_EVENT_ID, side }),
      });
      expect(register.status).toBe(200);
    }

    const verify = await fetch(`${baseUrl}/chat/v1/wire/witness/verify`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: DEMO_WITNESS_EVENT_ID }),
    });
    expect(verify.status).toBe(200);
    const body = (await verify.json()) as { quorum: { satisfied: boolean } };
    expect(body.quorum.satisfied).toBe(true);
  });

  it("flushes witness pending via chat BFF", async () => {
    const cookie = await loginCookie();
    const flush = await fetch(`${baseUrl}/chat/v1/wire/witness/flush`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(flush.status).toBe(200);
    const body = (await flush.json()) as { flushed: number };
    expect(body.flushed).toBeGreaterThanOrEqual(0);
  });
});
