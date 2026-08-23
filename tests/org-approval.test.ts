import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  proposeOrgApproval,
  approveOrgApproval,
  humanApproveOrgApproval,
  rejectOrgApproval,
  listOrgApprovals,
} from "../src/lib/org/approval/index.js";
import { loadProtocolAuditChain } from "../src/lib/protocol/audit-chain.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "org", "pending-approvals.yaml"),
    join(getDataDir(), "protocol"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("org approval root (internal scope)", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    ensureProtocolSigningKey();
  });

  afterEach(() => cleanup());

  it("propose → approve emits org.audit.attested with approval.granted", () => {
    const request = proposeOrgApproval({
      scope: "internal",
      subjectType: "regulation.amendment",
      subjectRef: "REG-004",
      proposedBy: "secretary",
      amount: { value: 85_000, currency: "JPY" },
      message: "稟議規程 改定案",
    });
    expect(request.approval_id).toMatch(/^APR-/);
    expect(request.approval_policy_ref).toBe("REG-004");

    const { approval, auditEnvelope } = humanApproveOrgApproval({
      approvalId: request.approval_id,
      approverId: "Demo CEO",
      operatorId: "OP-001",
      source: "cli",
    });

    expect(approval.status).toBe("approved");
    expect(approval.approval_tier).toBe("A");
    expect(auditEnvelope?.event.type).toBe("org.audit.attested");
    expect(auditEnvelope?.event.payload).toMatchObject({
      scope: "internal",
      kind: "approval.granted",
      approval_id: request.approval_id,
      subject_type: "regulation.amendment",
    });

    const chain = loadProtocolAuditChain();
    expect(chain.some((r) => r.event_id === auditEnvelope?.event_id)).toBe(true);
  });

  it("rejects pending internal approval and emits approval.rejected to audit-chain", () => {
    const request = proposeOrgApproval({
      scope: "internal",
      subjectType: "expenditure.capex",
      proposedBy: "ops",
      amount: { value: 50_000, currency: "JPY" },
    });
    const { approval: rejected, auditEnvelope } = rejectOrgApproval({
      approvalId: request.approval_id,
      approverId: "Demo CEO",
      reason: "defer",
    });
    expect(rejected.status).toBe("rejected");
    expect(listOrgApprovals({ status: "pending_approval" }).length).toBe(0);
    expect(auditEnvelope?.event.type).toBe("org.audit.attested");
    expect(auditEnvelope?.event.payload).toMatchObject({
      scope: "internal",
      kind: "approval.rejected",
      approval_id: request.approval_id,
      reject_reason: "defer",
    });
    const chain = loadProtocolAuditChain();
    expect(chain.some((r) => r.event_id === auditEnvelope?.event_id)).toBe(true);
  });

  it("requires operatorId bound to the named approver", () => {
    const request = proposeOrgApproval({
      scope: "internal",
      subjectType: "regulation.amendment",
      subjectRef: "REG-004",
      proposedBy: "secretary",
      amount: { value: 85_000, currency: "JPY" },
    });
    expect(() =>
      approveOrgApproval({
        approvalId: request.approval_id,
        approverId: "Demo CEO",
      })
    ).toThrow(/operatorId is required/);
    expect(() =>
      approveOrgApproval({
        approvalId: request.approval_id,
        approverId: "Not The CEO",
        operatorId: "OP-001",
      })
    ).toThrow(/does not match authenticated operator/);
    expect(() =>
      approveOrgApproval({
        approvalId: request.approval_id,
        approverId: "秘書オペレータ",
        operatorId: "OP-002",
      })
    ).toThrow(/cannot approve/);
  });

  it("forbids self-approval on generic internal subjects", () => {
    const request = proposeOrgApproval({
      scope: "internal",
      subjectType: "regulation.amendment",
      subjectRef: "REG-004",
      proposedBy: "OP-001",
      amount: { value: 85_000, currency: "JPY" },
    });
    expect(() =>
      approveOrgApproval({
        approvalId: request.approval_id,
        approverId: "Demo CEO",
        operatorId: "OP-001",
      })
    ).toThrow(/自己承認は禁止/);
  });
});
