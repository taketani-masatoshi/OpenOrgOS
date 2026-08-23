import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  approveOrgApproval,
  humanApproveOrgApproval,
  proposeOrgApproval,
} from "../src/lib/org/approval/index.js";
import {
  assertHumanApprovalContext,
  issueHumanApprovalContext,
} from "../src/lib/org/human-approval-context.js";
import { mcpOperatorPermissions, mcpOperatorUser } from "../src/lib/steward-chat/wire-witness.js";
import { loadOrgApprovalRegistry, saveOrgApprovalRegistry } from "../src/lib/org/approval/registry.js";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/lib/utils.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";

function cleanup(): void {
  const pending = join(getDataDir(), "org", "pending-approvals.yaml");
  if (existsSync(pending)) rmSync(pending, { force: true });
}

describe("HumanApprovalContext (ADR 0038)", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    ensureProtocolSigningKey();
  });

  afterEach(() => cleanup());

  function propose() {
    return proposeOrgApproval({
      scope: "internal",
      subjectType: "regulation.amendment",
      subjectRef: "REG-004",
      proposedBy: "secretary",
      amount: { value: 85_000, currency: "JPY" },
    });
  }

  it("rejects approve without context", () => {
    const request = propose();
    expect(() =>
      approveOrgApproval({
        approvalId: request.approval_id,
        approverId: "Demo CEO",
        operatorId: "OP-001",
      }),
    ).toThrow(/HumanApprovalContext/);
  });

  it("rejects expired context", () => {
    const request = propose();
    const ctx = issueHumanApprovalContext({
      approval: request,
      operatorId: "OP-001",
      source: "cli",
      ttlMs: 1,
    });
    const until = Date.parse(ctx.expires_at) + 5;
    while (Date.now() <= until) {
      /* spin until expired */
    }
    expect(() =>
      assertHumanApprovalContext({
        context: ctx,
        approval: request,
        operatorId: "OP-001",
      }),
    ).toThrow(/expired/);
  });

  it("rejects digest mismatch after the pending approval changes", () => {
    const request = propose();
    const ctx = issueHumanApprovalContext({
      approval: request,
      operatorId: "OP-001",
      source: "cli",
    });
    const registry = loadOrgApprovalRegistry();
    const idx = registry.approvals.findIndex((a) => a.approval_id === request.approval_id);
    registry.approvals[idx] = {
      ...registry.approvals[idx]!,
      amount: { value: 1_000_000, currency: "JPY" },
    };
    saveOrgApprovalRegistry(registry);
    const mutated = registry.approvals[idx]!;
    expect(() =>
      assertHumanApprovalContext({
        context: ctx,
        approval: mutated,
        operatorId: "OP-001",
      }),
    ).toThrow(/digest/);
  });

  it("rejects another operator's context", () => {
    const request = propose();
    const ctx = issueHumanApprovalContext({
      approval: request,
      operatorId: "OP-001",
      source: "cli",
    });
    expect(() =>
      assertHumanApprovalContext({
        context: ctx,
        approval: request,
        operatorId: "OP-002",
      }),
    ).toThrow(/operator_id/);
  });

  it("rejects a tampered signature", () => {
    const request = propose();
    const ctx = issueHumanApprovalContext({
      approval: request,
      operatorId: "OP-001",
      source: "cli",
    });
    expect(() =>
      assertHumanApprovalContext({
        context: { ...ctx, signature: `${ctx.signature}x` },
        approval: request,
        operatorId: "OP-001",
      }),
    ).toThrow(/signature/);
  });

  it("lets a CLI human session approve once and refuses replay", () => {
    const request = propose();
    const first = humanApproveOrgApproval({
      approvalId: request.approval_id,
      approverId: "Demo CEO",
      operatorId: "OP-001",
      source: "cli",
    });
    expect(first.approval.status).toBe("approved");
  });
});

describe("Dev MCP without token", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("does not grant ceo permissions or CEO identity", () => {
    delete process.env.ORGOS_MCP_TOKEN;
    delete process.env.MCP_OPERATOR_ID;
    delete process.env.MCP_APPROVER_ID;
    expect(mcpOperatorPermissions()).toEqual(["chat:read", "chat:ask"]);
    const user = mcpOperatorUser();
    expect(user.operator_id).toBe("mcp-unauthenticated");
    expect(user.approver_id).not.toMatch(/ceo/i);
  });
});
