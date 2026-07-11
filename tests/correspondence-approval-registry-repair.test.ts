import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { getExecutiveRecordsDir } from "../src/lib/correspondence/paths.js";
import {
  createCorrespondenceDraft,
  loadCorrespondenceDraft,
} from "../src/lib/correspondence/draft.js";
import {
  repairMissingApprovalForDraft,
  repairCorrespondenceApprovalRegistry,
} from "../src/lib/correspondence/approval-registry-repair.js";
import { findOrgApproval } from "../src/lib/org/approval/index.js";

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "org", "pending-approvals.yaml"),
    join(getDocsDir(), "executive", "correspondence-drafts"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("correspondence approval registry repair", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    writeFileSync(
      join(getDataDir(), "company.yaml"),
      YAML.stringify({
        name: "Test",
        public_disclosure: { representative_email: "rep@test.co.jp" },
      }),
      "utf-8"
    );
    mkdirSync(getExecutiveRecordsDir(), { recursive: true });
  });

  afterEach(() => cleanup());

  it("rebuilds a missing approval row from draft metadata", () => {
    const { draft, approvalId } = createCorrespondenceDraft({
      channel: "email",
      to: "a@example.com",
      subject: "Proposal",
      body: "Hello",
      createdBy: "secretary",
    });
    expect(approvalId).toBeTruthy();
    rmSync(join(getDataDir(), "org", "pending-approvals.yaml"), { force: true });

    repairMissingApprovalForDraft(loadCorrespondenceDraft(draft.draft_id));
    const approval = findOrgApproval(approvalId!);
    expect(approval?.subject_ref).toBe(draft.draft_id);
    expect(approval?.status).toBe("pending_approval");
  });

  it("scans all drafts and repairs orphan approval ids", () => {
    const first = createCorrespondenceDraft({
      channel: "email",
      to: "a@example.com",
      subject: "One",
      body: "A",
      createdBy: "secretary",
    });
    const second = createCorrespondenceDraft({
      channel: "email",
      to: "b@example.com",
      subject: "Two",
      body: "B",
      createdBy: "secretary",
    });
    rmSync(join(getDataDir(), "org", "pending-approvals.yaml"), { force: true });

    const result = repairCorrespondenceApprovalRegistry();
    expect(result.repaired).toEqual(
      expect.arrayContaining([first.draft.draft_id, second.draft.draft_id])
    );
  });
});
