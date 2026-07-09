import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import {
  createCorrespondenceDraft,
  loadCorrespondenceDraft,
} from "../src/lib/correspondence/draft.js";
import {
  assertCorrespondenceApproved,
  sendApprovedCorrespondence,
  CorrespondenceApprovalGateError,
} from "../src/lib/correspondence/send-gate.js";
import {
  approveOrgApproval,
} from "../src/lib/org/approval/index.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "org"),
    join(getDataDir(), "protocol"),
    join(getDataDir(), "company-events.yaml"),
    join(getDocsDir(), "executive", "correspondence-drafts"),
    join(getDocsDir(), "company", "events"),
    join(getDocsDir(), "company", "artifacts"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
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

  it("allows send after org approval approve", async () => {
    const { draft, approvalId } = createCorrespondenceDraft({
      channel: "email",
      to: "partner@example.com",
      subject: "Approved test",
      body: "Body",
      createdBy: "secretary",
    });

    approveOrgApproval({
      approvalId: approvalId!,
      approverId: "段燕燕",
      operatorId: "ceo",
    });

    const result = await sendApprovedCorrespondence({
      draftId: draft.draft_id,
      operatorId: "ceo",
    });

    expect(result.draft.status).toBe("sent");
    expect(result.companyEventId).toMatch(/^EVT-/);
    expect(result.sendResult.mode).toBe("dry_run");

    const reloaded = loadCorrespondenceDraft(draft.draft_id);
    expect(reloaded.sent_by).toBe("ceo");
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
