import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { gmailMailPort, m365MailPort } from "../src/lib/integrations/compat-ports.js";
import { oxMailPort } from "../src/lib/integrations/sovereign/ox-client.js";
import {
  buildSecretaryL1Note,
  mirrorSecretaryL1ToNextcloud,
  SECRETARY_L1_NOTE_PATH,
} from "../src/lib/integrations/secretary-l1-mirror.js";
import type { GmailApiClient } from "../src/lib/integrations/compat/gmail-api.js";

describe("secretary MailPort", () => {
  beforeEach(() => {
    setTenantId("demo");
  });

  it("fetches and sends through the Gmail compat port without naming the API in callers", async () => {
    const client: GmailApiClient = {
      async listMessageIds() {
        return ["m1"];
      },
      async getMessageRaw(id) {
        return { id, threadId: "t1", internalDate: "1", raw: "From: a\r\n\r\nbody" };
      },
    };
    const port = gmailMailPort({
      client,
      resolveToken: async () => "token",
      fetchImpl: (async () =>
        new Response(JSON.stringify({ id: "sent-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch,
    });
    const fetched = await port.fetchSince({ label: "INBOX" });
    expect(fetched.ok).toBe(true);
    expect(fetched.messages?.[0]?.id).toBe("m1");
    expect(fetched.messages?.[0]?.mime).toContain("body");

    const sent = await port.sendMime({ mime: "From: a\r\nTo: b\r\n\r\nhi" });
    expect(sent.ok).toBe(true);
    expect(sent.messageId).toBe("sent-1");
  });

  it("keeps Open-Xchange fetch and send off the network while stub_unconfirmed", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const port = oxMailPort("stub_unconfirmed", { baseUrl: "http://ox.local" }, fetchImpl as typeof fetch);
    const ping = await port.ping();
    const fetched = await port.fetchSince();
    const sent = await port.sendMime({ mime: "x" });
    expect(ping.ok).toBe(false);
    expect(fetched.ok).toBe(false);
    expect(sent.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(fetched.reason).toMatch(/外へは出しません/);
  });

  it("keeps Microsoft 365 mail as a non-network stub", async () => {
    const port = m365MailPort();
    expect((await port.fetchSince()).ok).toBe(false);
    expect((await port.sendMime({ mime: "x" })).ok).toBe(false);
  });

  it("builds an L1 secretary note without subjects and skips Nextcloud without env", async () => {
    const note = buildSecretaryL1Note({
      now: "2026-09-20T00:00:00.000Z",
      receiveState: {
        version: 1,
        last_uid: 0,
        last_sync_at: "2026-09-19T00:00:00.000Z",
        last_sync_count: 2,
      },
      triageCount: 3,
      highPriority: 1,
    });
    expect(note).toContain("triage_entries: 3");
    expect(note).not.toMatch(/Subject|From:/i);

    const skipped = await mirrorSecretaryL1ToNextcloud({ config: null });
    expect(skipped.ok).toBe(false);

    const calls: string[] = [];
    const mirrored = await mirrorSecretaryL1ToNextcloud({
      config: { baseUrl: "http://cloud.local", user: "admin", password: "x" },
      body: note,
      fetchImpl: (async (url: string | URL, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${String(url)}`);
        return new Response("", { status: 201 });
      }) as typeof fetch,
    });
    expect(mirrored.ok).toBe(true);
    expect(calls.some((c) => c.includes("MKCOL") && c.includes("opendesk-verify"))).toBe(true);
    expect(calls.some((c) => c.includes("PUT") && c.includes(SECRETARY_L1_NOTE_PATH))).toBe(true);
  });
});
