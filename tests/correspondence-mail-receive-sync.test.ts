import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { getExecutiveRecordsDir, getMailReceivedDir } from "../src/lib/correspondence/paths.js";
import {
  syncMailReceive,
  type FetchedMailMessage,
  type MailReceiveFetcher,
} from "../src/lib/correspondence/mail-receive-sync.js";
import { loadMailReceiveState } from "../src/lib/correspondence/mail-receive-state.js";
import { getMailConfigPath } from "../src/lib/correspondence/paths.js";

const sampleEml = readFileSync(join(import.meta.dirname, "fixtures/mail/sample.eml"), "utf-8");

function mockFetcher(messages: FetchedMailMessage[]): MailReceiveFetcher {
  return {
    async fetchSinceUid(opts) {
      return messages.filter((m) => m.uid > opts.sinceUid);
    },
  };
}

function seedImapConfig(): void {
  mkdirSync(getExecutiveRecordsDir(), { recursive: true });
  writeFileSync(
    getMailConfigPath(),
    YAML.stringify({
      provider: "smtp",
      from: { name: "Test", email: "test@example.com" },
      smtp: { host: "smtp.test.local", port: 587, secure: false },
      receive: {
        sync: "imap",
        imap_host: "imap.test.local",
        imap_port: 993,
        poll_interval_sec: 300,
      },
    }),
    "utf-8"
  );
  process.env.ORGOS_IMAP_USER = "imap-user";
  process.env.ORGOS_IMAP_PASSWORD = "imap-pass";
}

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "executive"),
    getExecutiveRecordsDir(),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
  delete process.env.ORGOS_IMAP_USER;
  delete process.env.ORGOS_IMAP_PASSWORD;
}

describe("correspondence mail receive sync", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
  });

  afterEach(() => cleanup());

  it("stub mode returns no-op", async () => {
    const result = await syncMailReceive();
    expect(result.mode).toBe("stub");
    expect(result.fetched).toBe(0);
  });

  it("saves .eml files and updates last_uid via mock fetcher", async () => {
    seedImapConfig();
    const fetcher = mockFetcher([
      {
        uid: 101,
        messageId: "<uid-101@test>",
        from: "a@example.com",
        subject: "Hello",
        receivedAt: "2026-07-10T00:00:00.000Z",
        raw: sampleEml,
      },
    ]);

    const result = await syncMailReceive({ fetcher });
    expect(result.mode).toBe("imap");
    expect(result.fetched).toBe(1);
    expect(result.saved).toHaveLength(1);
    expect(existsSync(join(getMailReceivedDir(), result.saved[0]!))).toBe(true);

    const state = loadMailReceiveState();
    expect(state.last_uid).toBe(101);
  });
});
