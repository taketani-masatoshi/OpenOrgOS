import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { createCorrespondenceDraft } from "../src/lib/correspondence/draft.js";
import {
  approveOrgApproval,
  humanApproveOrgApproval,
} from "../src/lib/org/approval/index.js";
import {
  sendApprovedCorrespondence,
  CorrespondenceApprovalGateError,
} from "../src/lib/correspondence/send-gate.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";


function seedContact(email = "partner@example.com"): void {
  const execDir = join(getDataDir(), "executive");
  mkdirSync(execDir, { recursive: true });
  writeFileSync(
    join(execDir, "external-contacts.yaml"),
    YAML.stringify({ contacts: [{ id: "EXT-001", name: "Partner", org: "Example", email }] }),
    "utf-8",
  );
}

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "org", "pending-approvals.yaml"),
    join(getDataDir(), "protocol"),
    join(getDocsDir(), "executive", "correspondence-drafts"),
    join(getDataDir(), "executive", "external-contacts.yaml"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("correspondence human approval gate", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    ensureProtocolSigningKey();
    seedContact();
  });
  afterEach(() => cleanup());

  it("blocks send when approval lacks human_review_confirmed_at", async () => {
    const { draft, approvalId } = createCorrespondenceDraft({
      channel: "email",
      to: "partner@example.com",
      subject: "Gate",
      body: "Body",
      createdBy: "secretary",
    });

    expect(() =>
      approveOrgApproval({
        approvalId: approvalId!,
        approverId: "Demo CEO",
        operatorId: "OP-001",
      })
    ).toThrow(/humanReviewConfirmed/i);

    humanApproveOrgApproval({
      approvalId: approvalId!,
      approverId: "Demo CEO",
      operatorId: "OP-001",
      source: "cli",
      humanReviewConfirmed: true,
    });

    await expect(
      sendApprovedCorrespondence({ draftId: draft.draft_id, operatorId: "secretary" })
    ).rejects.toThrow(/ceo\/approver operator id/i);

    await expect(
      sendApprovedCorrespondence({ draftId: draft.draft_id, operatorId: "OP-002" })
    ).rejects.toThrow(/ceo\/approver operator id/i);
  });
});
