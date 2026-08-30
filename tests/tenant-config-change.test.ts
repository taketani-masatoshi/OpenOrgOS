import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { loadEnabledIsoIds } from "../src/lib/tenant-standards.js";
import {
  approveAndApplyTenantConfigChange,
  applyTenantConfigChange,
  findTenantConfigChangeByApproval,
  isTenantConfigPrivilegeIncrease,
  previewTenantConfigChange,
  proposeTenantConfigChange,
  rejectTenantConfigChange,
} from "../src/lib/org/tenant-config-change.js";
import { findOrgApproval } from "../src/lib/org/approval/approve.js";
import { isModuleInstalled } from "../src/lib/module-import.js";
import { isAgentActive } from "../src/lib/agent-catalog.js";
import { buildAgentModuleInventory } from "../src/lib/steward-chat/agent-module-inventory.js";
import { preserveTenantSsot } from "./helpers/tenant-ssot-snapshot.js";
import {
  handleTenantConfigProposeChatMessage,
  parseTenantConfigProposeIntent,
} from "../src/lib/steward-chat/tenant-config-intent.js";

function cleanupOrgArtifacts(): void {
  for (const rel of ["org/pending-approvals.yaml", "org/config-change-requests.yaml"]) {
    const p = join(getDataDir(), rel);
    if (existsSync(p)) rmSync(p, { force: true });
  }
}

describe("tenant config change (standards)", () => {
  preserveTenantSsot("mal");

  beforeEach(() => {
    setTenantId("mal");
    cleanupOrgArtifacts();
    process.env.STEWARD_OPERATOR_AUTH = "0";
  });

  afterEach(() => {
    cleanupOrgArtifacts();
  });

  it("parses ISMS / ISO-27001 enable intents", () => {
    expect(parseTenantConfigProposeIntent("ISMSを有効にして")).toEqual({
      target: "standards",
      targetId: "ISO-27001",
      enabled: true,
    });
    expect(parseTenantConfigProposeIntent("ISO-22301 を有効化")).toEqual({
      target: "standards",
      targetId: "ISO-22301",
      enabled: true,
    });
    expect(parseTenantConfigProposeIntent("ISO-37000 を有効にして")).toEqual({
      target: "standards",
      targetId: "ISO-37000",
      enabled: true,
    });
    expect(parseTenantConfigProposeIntent("こんにちは")).toBeNull();
  });

  it("proposes, previews, and applies ISO disable then restore after reviewed approve", () => {
    const targetId = "ISO-50001";
    expect(loadEnabledIsoIds().includes(targetId)).toBe(true);

    const proposed = proposeTenantConfigChange({
      target: "standards",
      targetId,
      enabled: false,
      proposedBy: "op-steward",
      message: "Disable energy ISO for test",
    });
    expect(proposed.change.status).toBe("pending_approval");
    expect(findOrgApproval(proposed.approval_id)?.subject_type).toBe("tenant.config");

    expect(() =>
      proposeTenantConfigChange({
        target: "standards",
        targetId,
        enabled: false,
        proposedBy: "op-steward",
      })
    ).toThrow(/Pending change already exists/);

    const preview = previewTenantConfigChange(proposed.approval_id);
    expect(preview.diff_line).toContain("true → false");
    expect(preview.side_effects_plan.some((s) => s.includes("sync-context"))).toBe(true);

    expect(() =>
      approveAndApplyTenantConfigChange({
        approvalId: proposed.approval_id,
        approverId: "CEO",
        operatorId: "OP-001",
        reviewed: false,
      })
    ).toThrow(/reviewed=true/);

    const applied = approveAndApplyTenantConfigChange({
      approvalId: proposed.approval_id,
      approverId: "段燕燕",
      operatorId: "OP-001",
      reviewed: true,
    });
    expect(applied.change.status).toBe("applied");
    expect(loadEnabledIsoIds()).not.toContain(targetId);

    const restore = proposeTenantConfigChange({
      target: "standards",
      targetId,
      enabled: true,
      proposedBy: "op-steward",
    });
    approveAndApplyTenantConfigChange({
      approvalId: restore.approval_id,
      approverId: "段燕燕",
      operatorId: "OP-001",
      reviewed: true,
    });
    expect(loadEnabledIsoIds()).toContain(targetId);
  });

  it("rejects pending change without applying", () => {
    const proposed = proposeTenantConfigChange({
      target: "standards",
      targetId: "ISO-37001",
      enabled: false,
      proposedBy: "op-steward",
    });
    rejectTenantConfigChange({
      approvalId: proposed.approval_id,
      approverId: "段燕燕",
      reason: "not now",
    });
    const change = findTenantConfigChangeByApproval(proposed.approval_id);
    expect(change?.status).toBe("rejected");
    expect(loadEnabledIsoIds()).toContain("ISO-37001");
  });

  it("chat intent proposes without applying", () => {
    const result = handleTenantConfigProposeChatMessage("ISO-20000 を無効にして", {
      proposedBy: "op-steward",
    });
    expect(result.handled).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.approval_id).toMatch(/^APR-/);
    expect(result.reply).toMatch(/承認待ち/);
    expect(result.reply).toMatch(/\/approvals\//);
    expect(loadEnabledIsoIds()).toContain("ISO-20000");
  });

  it("lets the proposing CEO confirm tenant.config (inbox, not a second person)", () => {
    const targetId = "ISO-37001";
    expect(loadEnabledIsoIds().includes(targetId)).toBe(true);
    const proposed = proposeTenantConfigChange({
      target: "standards",
      targetId,
      enabled: false,
      proposedBy: "OP-001",
    });
    expect(() =>
      approveAndApplyTenantConfigChange({
        approvalId: proposed.approval_id,
        approverId: "Demo CEO",
        operatorId: "OP-001",
        reviewed: true,
      })
    ).toThrow(/does not match authenticated operator/);

    const applied = approveAndApplyTenantConfigChange({
      approvalId: proposed.approval_id,
      approverId: "段燕燕",
      operatorId: "OP-001",
      reviewed: true,
    });
    expect(applied.change.status).toBe("applied");
    expect(loadEnabledIsoIds()).not.toContain(targetId);

    const restore = proposeTenantConfigChange({
      target: "standards",
      targetId,
      enabled: true,
      proposedBy: "OP-001",
    });
    approveAndApplyTenantConfigChange({
      approvalId: restore.approval_id,
      approverId: "段燕燕",
      operatorId: "OP-001",
      reviewed: true,
    });
    expect(loadEnabledIsoIds()).toContain(targetId);
  });

  it("proposes agent enable and import_enable module changes", () => {
    const agent = buildAgentModuleInventory().agents_available[0];
    expect(agent).toBeTruthy();
    const agentProposed = proposeTenantConfigChange({
      target: "agents",
      targetId: agent!.id,
      enabled: true,
      proposedBy: "op-steward",
    });
    expect(isTenantConfigPrivilegeIncrease(agentProposed.change)).toBe(true);
    expect(isAgentActive(agent!.id as "procurement", { profile: "operational" })).toBe(false);
    const agentApplied = applyTenantConfigChange(agentProposed.change.change_id);
    expect(agentApplied.change.target).toBe("agents");

    const catalog = buildAgentModuleInventory().modules_catalog[0];
    expect(catalog).toBeTruthy();
    const modProposed = proposeTenantConfigChange({
      target: "modules",
      targetId: catalog!.id,
      enabled: true,
      action: "import_enable",
      proposedBy: "op-steward",
    });
    expect(modProposed.change.action).toBe("import_enable");
    expect(isModuleInstalled(catalog!.id)).toBe(false);
    applyTenantConfigChange(modProposed.change.change_id);
    expect(isModuleInstalled(catalog!.id)).toBe(true);
  });
});
