import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  proposeOrgApproval,
  approveOrgApproval,
  rejectOrgApproval,
  listOrgApprovals,
} from "../src/lib/org/approval/index.js";
import { loadProtocolAuditChain } from "../src/lib/protocol/audit-chain.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "org"), join(getDataDir(), "protocol")]) {
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

    const { approval, auditEnvelope } = approveOrgApproval({
      approvalId: request.approval_id,
      approverId: "段燕燕",
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

  it("rejects pending internal approval", () => {
    const request = proposeOrgApproval({
      scope: "internal",
      subjectType: "expenditure.capex",
      proposedBy: "ops",
      amount: { value: 50_000, currency: "JPY" },
    });
    const rejected = rejectOrgApproval({
      approvalId: request.approval_id,
      approverId: "段燕燕",
      reason: "defer",
    });
    expect(rejected.status).toBe("rejected");
    expect(listOrgApprovals({ status: "pending_approval" }).length).toBe(0);
  });
});
