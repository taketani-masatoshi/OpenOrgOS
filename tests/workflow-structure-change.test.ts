import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  applyLlmProposalOverlay,
  applyWorkflowStructureChangeProposal,
  evaluateWorkflowDocument,
  loadWorkflowDocument,
  proposeWorkflowStructureChange,
  SYSTEM_MAP_SAMPLE,
  validateWorkflowStructureChangeInput,
  workflowChangesDir,
  writeWorkflowDocument,
  WORKFLOW_STRUCTURE_SUBJECT,
} from "../src/lib/workflow-canvas/index.js";
import { workflowStructureChangeProposalSchema } from "../schemas/workflow-structure-change.js";
import {
  humanApproveOrgApproval,
  proposeOrgApproval,
} from "../src/lib/org/approval/index.js";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";

function cleanupWorkflowRuntime(): void {
  for (const p of [
    join(getDataDir(), "org", "pending-approvals.yaml"),
    join(getDataDir(), "org", "workflow-changes"),
    join(getDataDir(), "org", "workflow-change-audit.jsonl"),
    join(getDataDir(), "org", "workflows"),
    join(getDataDir(), "protocol"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("workflow structure change (WFS)", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanupWorkflowRuntime();
    ensureProtocolSigningKey();
    mkdirSync(join(getDataDir(), "org", "workflows"), { recursive: true });
    writeWorkflowDocument(SYSTEM_MAP_SAMPLE);
  });

  afterEach(() => {
    cleanupWorkflowRuntime();
  });

  it("evaluates the system map sample without graph errors", () => {
    const result = evaluateWorkflowDocument(SYSTEM_MAP_SAMPLE);
    expect(result.ok).toBe(true);
    expect(result.proposed_document.workflow_id).toBe("WF-system-map");
    expect(result.findings.some((f) => f.code === "platform_module_id")).toBe(true);
  });

  it("flags dangling edges and repairs them in the proposal", () => {
    const broken = {
      ...SYSTEM_MAP_SAMPLE,
      edges: [
        ...SYSTEM_MAP_SAMPLE.edges,
        {
          id: "e-dangling",
          source: "aia-secretary",
          target: "missing-node",
          kind: "handoff" as const,
        },
      ],
    };
    const result = evaluateWorkflowDocument(broken);
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === "missing_edge_target")).toBe(true);
    expect(result.proposed_document.edges.some((e) => e.id === "e-dangling")).toBe(false);
  });

  it("accepts a fixture LLM overlay and rejects bad overlay", () => {
    const base = evaluateWorkflowDocument(SYSTEM_MAP_SAMPLE);
    const good = applyLlmProposalOverlay(base.proposed_document, {
      ...base.proposed_document,
      title: "LLM retitled",
    });
    expect(good.used_llm).toBe(true);
    expect(good.proposed_document.title).toBe("LLM retitled");

    const bad = applyLlmProposalOverlay(base.proposed_document, { version: 1 });
    expect(bad.used_llm).toBe(false);
    expect(bad.error).toBeTruthy();
  });

  it("validates propose input and requires findings", () => {
    const evaluated = evaluateWorkflowDocument(SYSTEM_MAP_SAMPLE);
    const input = validateWorkflowStructureChangeInput({
      workflow_id: "WF-system-map",
      grade: "A",
      reason: "discussion",
      draft_document: evaluated.document,
      proposed_document: evaluated.proposed_document,
      findings: evaluated.findings,
    });
    expect(input.workflow_id).toBe("WF-system-map");
  });

  it("rejects apply when the approval is not approved", () => {
    const approval = proposeOrgApproval({
      scope: "internal",
      subjectType: WORKFLOW_STRUCTURE_SUBJECT,
      proposedBy: "secretary",
      subjectRef: "WFS-pending",
      message: "pending",
    });
    const evaluated = evaluateWorkflowDocument(SYSTEM_MAP_SAMPLE);
    const proposal = workflowStructureChangeProposalSchema.parse({
      change_id: "WFS-20260917-009",
      approval_id: approval.approval_id,
      proposed_at: new Date().toISOString(),
      proposed_by: "OP-001",
      workflow_id: "WF-system-map",
      grade: "A",
      reason: "pending",
      draft_document: evaluated.document,
      proposed_document: {
        ...evaluated.proposed_document,
        title: "Should not apply",
      },
      findings: evaluated.findings,
    });
    expect(() =>
      applyWorkflowStructureChangeProposal({ proposal, appliedBy: "OP-001" }),
    ).toThrow(/not approved/);
  });

  it("rejects grade C apply", () => {
    const approval = proposeOrgApproval({
      scope: "internal",
      subjectType: WORKFLOW_STRUCTURE_SUBJECT,
      proposedBy: "secretary",
      subjectRef: "WFS-grade-c",
      message: "grade c",
    });
    humanApproveOrgApproval({
      approvalId: approval.approval_id,
      approverId: "Demo CEO",
      operatorId: "OP-001",
      source: "cli",
    });
    const evaluated = evaluateWorkflowDocument(SYSTEM_MAP_SAMPLE);
    const proposal = workflowStructureChangeProposalSchema.parse({
      change_id: "WFS-20260917-008",
      approval_id: approval.approval_id,
      proposed_at: new Date().toISOString(),
      proposed_by: "OP-001",
      workflow_id: "WF-system-map",
      grade: "C",
      reason: "permit redesign",
      regulation_ref: {
        reg_id: "REG-012",
        clause: "§1",
        artifact_path: "docs/company/regulations/shukuhaku-unyo-kisoku.md",
      },
      draft_document: evaluated.document,
      proposed_document: evaluated.proposed_document,
      findings: evaluated.findings,
    });
    expect(() =>
      applyWorkflowStructureChangeProposal({ proposal, appliedBy: "OP-001" }),
    ).toThrow(/grade C/);
  });

  it("records a proposal and applies after approval", () => {
    const approval = proposeOrgApproval({
      scope: "internal",
      subjectType: WORKFLOW_STRUCTURE_SUBJECT,
      proposedBy: "secretary",
      subjectRef: "WFS-apply",
      message: "structure update",
    });
    humanApproveOrgApproval({
      approvalId: approval.approval_id,
      approverId: "Demo CEO",
      operatorId: "OP-001",
      source: "cli",
    });

    const evaluated = evaluateWorkflowDocument(SYSTEM_MAP_SAMPLE);
    const proposed = {
      ...evaluated.proposed_document,
      title: "Updated system map",
    };
    const proposal = proposeWorkflowStructureChange({
      approvalId: approval.approval_id,
      proposedBy: "OP-001",
      input: {
        workflow_id: "WF-system-map",
        grade: "A",
        reason: "canvas discussion",
        draft_document: evaluated.document,
        proposed_document: proposed,
        findings: evaluated.findings,
      },
    });
    expect(proposal.change_id).toMatch(/^WFS-\d{8}-\d{3}$/);
    expect(existsSync(join(workflowChangesDir(), `${proposal.change_id}.yaml`))).toBe(true);

    const result = applyWorkflowStructureChangeProposal({
      proposal,
      appliedBy: "OP-001",
    });
    expect(result.dry_run).toBe(false);
    expect(loadWorkflowDocument("WF-system-map")?.title).toBe("Updated system map");
  });
});
