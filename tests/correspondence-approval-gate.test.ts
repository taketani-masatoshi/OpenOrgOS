import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { getExecutiveRecordsDir, getMailConfigPath } from "../src/lib/correspondence/paths.js";
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
import {
  approveOrgApproval,
} from "../src/lib/org/approval/index.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";

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
    "utf-8"
  );
  process.env.ORGOS_SMTP_USER = "test-user";
  process.env.ORGOS_SMTP_PASSWORD = "test-pass";
}

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "org", "pending-approvals.yaml"),
    join(getDataDir(), "protocol"),
    join(getDataDir(), "company-events.yaml"),
    join(getDocsDir(), "executive", "correspondence-drafts"),
    join(getDocsDir(), "company", "events"),
    join(getDocsDir(), "company", "artifacts"),
    getExecutiveRecordsDir(),
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
  });

  afterEach(() => cleanup());

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
      sendApprovedCorrespondence({ draftId: draft.draft_id, operatorId: "ceo" })
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
    approveOrgApproval({
      approvalId: approvalId!,
      approverId: "Demo CEO",
      operatorId: "OP-001",
      humanReviewConfirmed: true,
    });
    await expect(
      sendApprovedCorrespondence({ draftId: draft.draft_id, operatorId: "OP-001" })
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

    approveOrgApproval({
      approvalId: approvalId!,
      approverId: "Demo CEO",
      operatorId: "OP-001",
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
