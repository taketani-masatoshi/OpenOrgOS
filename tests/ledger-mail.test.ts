import { describe, expect, it, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import {
  sendLedgerMail,
  listLedgerMailOutbox,
  hasRecentSuccessfulSmtpMail,
  runLedgerMailDrill,
  deliverSmtpMail,
} from "../src/lib/product/ledger-mail.js";

vi.mock("node:net", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    connect: () => {
      const socket = new EventEmitter() as EventEmitter & {
        destroy: (error?: Error) => void;
      };
      socket.destroy = (error?: Error) => {
        if (error) socket.emit("error", error);
        socket.emit("close");
      };
      process.nextTick(() => socket.emit("connect"));
      return socket;
    },
  };
});

describe("ledger mail outbox", () => {
  const env = { ...process.env };
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    refreshOrgOsPaths();
  });

  it("writes signup mail to outbox without SMTP", async () => {
    workspace = mkdtempSync(join(tmpdir(), "mail-outbox-"));
    process.env.ORGOS_WORKSPACE = workspace;
    delete process.env.ORGOS_MAIL_SMTP_URL;
    delete process.env.ORGOS_LEDGER_SMTP_URL;
    refreshOrgOsPaths();
    const result = await sendLedgerMail({
      kind: "signup_received",
      to: "ceo@example.com",
      tenantId: "demo-001",
      companyName: "Demo KK",
    });
    expect(result.transport).toBe("outbox");
    const messages = listLedgerMailOutbox();
    expect(messages.some((row) => row.kind === "signup_received")).toBe(true);
  });

  it("records smtp transport when mock SMTP succeeds", async () => {
    workspace = mkdtempSync(join(tmpdir(), "mail-smtp-"));
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_MAIL_SMTP_URL = "smtp://user:pass@127.0.0.1:2525";
    process.env.ORGOS_MAIL_SMTP_MOCK = "1";
    refreshOrgOsPaths();
    const result = await runLedgerMailDrill("ops@example.com");
    expect(result.transport).toBe("smtp");
    expect(hasRecentSuccessfulSmtpMail()).toBe(true);
  });

  it("times out when an SMTP server stops responding", async () => {
    delete process.env.ORGOS_MAIL_SMTP_MOCK;
    process.env.ORGOS_MAIL_SMTP_URL = "smtp://127.0.0.1:2525";
    await expect(deliverSmtpMail({ to: "ceo@example.com", subject: "test", body: "test" }, 100))
      .rejects.toThrow("SMTP delivery timed out");
  });
});
