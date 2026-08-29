import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { getExecutiveRecordsDir, getMailConfigPath, getMailReceivedDir } from "../src/lib/correspondence/paths.js";
import {
  createCorrespondenceDraft,
  loadCorrespondenceDraft,
} from "../src/lib/correspondence/draft.js";
import {
  assertCorrespondenceApproved,
  sendApprovedCorrespondence,
  CorrespondenceApprovalGateError,
} from "../src/lib/correspondence/send-gate.js";
import { CorrespondenceMailSetupError } from "../src/lib/correspondence/mail-setup-readiness.js";
import { CorrespondenceClaimsError } from "../src/lib/correspondence/claims-assert.js";
import { humanApproveOrgApproval } from "../src/lib/org/approval/index.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";

function seedContact(email: string, id = "EXT-001"): void {
  const execDir = join(getDataDir(), "executive");
  mkdirSync(execDir, { recursive: true });
  writeFileSync(
    join(execDir, "external-contacts.yaml"),
    YAML.stringify({
      contacts: [{ id, name: "Partner", org: "Example", email }],
    }),
    "utf-8",
  );
}

function seedMailSetupForTests(): void {
  const companyPath = join(getDataDir(), "company.yaml");
  const company = existsSync(companyPath)
    ? (YAML.parse(readFileSync(companyPath, "utf-8")) as Record<string, unknown>)
    : { name: "Test Co" };
  company.public_disclosure = { representative_email: "rep@test.co.jp" };
  writeFileSync(companyPath, YAML.stringify(company), "utf-8");

  mkdirSync(getExecutiveRecordsDir(), { recursive: true });
  writeFileSync(
    getMailConfigPath(),
    YAML.stringify({
      provider: "smtp",
      from: { name: "Test Co", email: "rep@test.co.jp" },
      smtp: { host: "smtp.test.local", port: 587, secure: false },
      receive: { sync: "stub" },
    }),
    "utf-8",
  );
  process.env.ORGOS_SMTP_USER = "test-user";
  process.env.ORGOS_SMTP_PASSWORD = "test-pass";
}

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "org", "pending-approvals.yaml"),
    join(getDataDir(), "protocol"),
    join(getDataDir(), "company-events.yaml"),
    join(getDataDir(), "executive", "external-contacts.yaml"),
    join(getDocsDir(), "executive", "correspondence-drafts"),
    join(getDocsDir(), "company", "events"),
    join(getDocsDir(), "company", "artifacts"),
    getExecutiveRecordsDir(),
    getMailReceivedDir(),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
  delete process.env.ORGOS_SMTP_USER;
  delete process.env.ORGOS_SMTP_PASSWORD;
}

describe("correspondence approval gate", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    ensureProtocolSigningKey();
    seedContact("partner@example.com");
  });

  afterEach(() => cleanup());

  it("blocks draft when body has amounts without verified claims pack", () => {
    expect(() =>
      createCorrespondenceDraft({
        channel: "email",
        to: "partner@example.com",
        subject: "Quote",
        body: "お見積は 500000 円です。",
        createdBy: "secretary",
      }),
    ).toThrow(/amount claim|金額/);
  });

  it("blocks draft when recipient is not in registry", () => {
    expect(() =>
      createCorrespondenceDraft({
        channel: "email",
        to: "unknown@nowhere.example",
        subject: "Test",
        body: "Hello",
        createdBy: "secretary",
      }),
    ).toThrow(CorrespondenceClaimsError);
  });

  it("blocks send without human approval", async () => {
    const { draft } = createCorrespondenceDraft({
      channel: "email",
      to: "partner@example.com",
      subject: "Test",
      body: "Hello",
      createdBy: "secretary",
    });

    expect(draft.status).toBe("pending_approval");
    expect(() => assertCorrespondenceApproved(draft)).toThrow(CorrespondenceApprovalGateError);

    await expect(
      sendApprovedCorrespondence({ draftId: draft.draft_id, operatorId: "ceo" }),
    ).rejects.toThrow(/not approved|human approval required/i);
  });

  it("blocks send without mail setup even when approved", async () => {
    const { draft, approvalId } = createCorrespondenceDraft({
      channel: "email",
      to: "partner@example.com",
      subject: "Setup gate",
      body: "Body",
      createdBy: "secretary",
    });
    humanApproveOrgApproval({
      approvalId: approvalId!,
      approverId: "Demo CEO",
      operatorId: "OP-001",
      source: "cli",
      humanReviewConfirmed: true,
    });
    await expect(
      sendApprovedCorrespondence({ draftId: draft.draft_id, operatorId: "OP-001" }),
    ).rejects.toThrow(CorrespondenceMailSetupError);
  });

  it("allows send after org approval approve and mail setup", async () => {
    seedMailSetupForTests();
    const { draft, approvalId } = createCorrespondenceDraft({
      channel: "email",
      to: "partner@example.com",
      subject: "Approved test",
      body: "Body",
      createdBy: "secretary",
    });

    humanApproveOrgApproval({
      approvalId: approvalId!,
      approverId: "Demo CEO",
      operatorId: "OP-001",
      source: "cli",
      humanReviewConfirmed: true,
    });

    const result = await sendApprovedCorrespondence({
      draftId: draft.draft_id,
      operatorId: "OP-001",
    });

    expect(result.draft.status).toBe("sent");
    expect(result.companyEventId).toMatch(/^EVT-/);
    expect(result.sendResult.mode).toBe("dry_run");

    const reloaded = loadCorrespondenceDraft(draft.draft_id);
    expect(reloaded.sent_by).toBe("OP-001");
    expect(reloaded.company_event_id).toBe(result.companyEventId);
  });

  it("creates internal approval with correspondence.email subject_type", () => {
    seedContact("a@b.com", "EXT-002");
    const { draft, approvalId } = createCorrespondenceDraft({
      channel: "email",
      to: "a@b.com",
      subject: "x",
      body: "y",
      createdBy: "secretary",
    });
    expect(draft.approval_id).toBe(approvalId);
    expect(approvalId).toMatch(/^APR-/);
  });
});
