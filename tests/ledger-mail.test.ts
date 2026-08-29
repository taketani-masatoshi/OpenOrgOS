import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import {
  sendLedgerMail,
  listLedgerMailOutbox,
  hasRecentSuccessfulSmtpMail,
  runLedgerMailDrill,
} from "../src/lib/product/ledger-mail.js";

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
});
