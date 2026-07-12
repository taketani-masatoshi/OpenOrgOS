import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { createCorrespondenceDraft } from "../src/lib/correspondence/draft.js";
import {
  assertCorrespondenceReviewAcknowledged,
  CorrespondenceReviewRequiredError,
  formatCorrespondenceDraftReview,
} from "../src/lib/correspondence/review.js";
import { findOrgApproval } from "../src/lib/org/approval/index.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import {
  approveFromStewardChat,
  loadSchedulingCorrespondencePreview,
} from "../src/lib/steward-chat/wire-approve.js";

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "org"),
    join(getDataDir(), "protocol"),
    join(getDocsDir(), "executive", "correspondence-drafts"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("correspondence review gate", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    ensureProtocolSigningKey();
  });
  afterEach(() => cleanup());

  it("blocks approval without --reviewed for correspondence.email", () => {
    const { approvalId } = createCorrespondenceDraft({
      channel: "email",
      to: "partner@example.com",
      subject: "Review me",
      body: "Full body text for CEO",
      createdBy: "secretary",
    });
    const approval = findOrgApproval(approvalId!)!;
    expect(() =>
      assertCorrespondenceReviewAcknowledged({ approval, reviewed: false })
    ).toThrow(CorrespondenceReviewRequiredError);
  });

  it("allows approval when reviewed flag is set", () => {
    const { approvalId } = createCorrespondenceDraft({
      channel: "email",
      to: "partner@example.com",
      subject: "Review me",
      body: "Full body text",
      createdBy: "secretary",
    });
    const approval = findOrgApproval(approvalId!)!;
    expect(() =>
      assertCorrespondenceReviewAcknowledged({ approval, reviewed: true })
    ).not.toThrow();
  });

  it("formats human-readable draft review with cc line", () => {
    const { draft } = createCorrespondenceDraft({
      channel: "email",
      to: "partner@example.com",
      subject: "Subject",
      body: "Body",
      createdBy: "secretary",
      proposeApproval: false,
      skipCcDefaults: true,
      cc: "ceo@test.co.jp",
    });
    const text = formatCorrespondenceDraftReview(draft);
    expect(text).toContain("cc: ceo@test.co.jp");
    expect(text).toContain("Body");
    expect(text).toContain("--reviewed");
  });

  it("allows only reviewed scheduling correspondence through Chat", async () => {
    const { draft, approvalId } = createCorrespondenceDraft({
      channel: "email",
      to: "partner@example.com",
      subject: "日程候補",
      body: "候補日時の全文です。",
      createdBy: "secretary",
      notes: "scheduling-case:SCH-2026-001",
      skipCcDefaults: true,
    });
    const user = {
      operator_id: "ceo-test",
      approver_id: "Demo CEO",
      mode: "dev" as const,
    };

    const review = loadSchedulingCorrespondencePreview(approvalId!);
    expect(review.draft_id).toBe(draft.draft_id);
    expect(review.preview).toContain("候補日時の全文です。");
    await expect(
      approveFromStewardChat(approvalId!, user, { reviewed: false })
    ).rejects.toThrow(/reviewed=true/);
    const approved = await approveFromStewardChat(approvalId!, user, { reviewed: true });
    expect(approved.approval_id).toBe(approvalId);
    expect(approved.sent_draft_ids).toBeUndefined();
  });

  it("keeps general correspondence Chat approval forbidden", () => {
    const { approvalId } = createCorrespondenceDraft({
      channel: "email",
      to: "partner@example.com",
      subject: "一般連絡",
      body: "一般 correspondence",
      createdBy: "secretary",
      skipCcDefaults: true,
    });
    expect(() => loadSchedulingCorrespondencePreview(approvalId!)).toThrow(
      /not scheduling correspondence/
    );
  });
});
