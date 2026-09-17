import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  WORKFLOW_STRUCTURE_SUBJECT,
  workflowStructureChangeInputSchema,
  workflowStructureChangeProposalSchema,
  type WorkflowStructureChangeInput,
  type WorkflowStructureChangeProposal,
} from "../../../schemas/workflow-structure-change.js";
import { workflowDocumentSchema, type WorkflowDocument } from "../../../schemas/workflow-canvas.js";
import { findOrgApproval } from "../org/approval/approve.js";
import { writeTenantContentGuarded } from "../org/fs-guard/guarded-write.js";
import { currentCanonicalSha256, isFsGuardEnforced } from "../org/fs-guard/index.js";
import { appendJsonl } from "../jsonl-store.js";
import { tenantDataPath } from "../tenant.js";
import { writeYamlFile } from "../utils.js";
import { evaluateWorkflowDocument } from "./evaluate.js";
import {
  loadWorkflowDocument,
  workflowLogicalPath,
  workflowYamlPath,
  writeWorkflowDocument,
} from "./store.js";

export { WORKFLOW_STRUCTURE_SUBJECT };

export function validateWorkflowStructureChangeInput(
  raw: unknown,
): WorkflowStructureChangeInput {
  return workflowStructureChangeInputSchema.parse(raw);
}

export function validateWorkflowStructureChangeProposal(
  raw: unknown,
): WorkflowStructureChangeProposal {
  return workflowStructureChangeProposalSchema.parse(raw);
}

function documentHash(document: WorkflowDocument): string {
  const body = YAML.stringify(document);
  return `sha256:${createHash("sha256").update(body, "utf-8").digest("hex")}`;
}

function workflowAuditPath(): string {
  return tenantDataPath("org", "workflow-change-audit.jsonl");
}

function assertApprovalReady(approvalId: string): void {
  const approval = findOrgApproval(approvalId);
  if (!approval) {
    throw new Error(`approval not found: ${approvalId}`);
  }
  if (approval.status !== "approved" && approval.status !== "completed") {
    throw new Error(`approval ${approvalId} is not approved (status=${approval.status})`);
  }
}

export function workflowChangesDir(): string {
  return tenantDataPath("org", "workflow-changes");
}

function proposalPath(changeId: string): string {
  return join(workflowChangesDir(), `${changeId}.yaml`);
}

function nextChangeId(now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  let existing: string[] = [];
  try {
    existing = readdirSync(workflowChangesDir());
  } catch {
    existing = [];
  }
  const prefix = `WFS-${day}-`;
  let max = 0;
  for (const name of existing) {
    if (!name.startsWith(prefix)) continue;
    const seq = Number.parseInt(name.slice(prefix.length, prefix.length + 3), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function loadWorkflowStructureChangeProposal(
  changeId: string,
): WorkflowStructureChangeProposal {
  const raw = readFileSync(proposalPath(changeId), "utf-8");
  return validateWorkflowStructureChangeProposal(YAML.parse(raw));
}

export function listWorkflowStructureChangeProposals(): WorkflowStructureChangeProposal[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(workflowChangesDir()).filter((n) => n.endsWith(".yaml"));
  } catch {
    return [];
  }
  const proposals: WorkflowStructureChangeProposal[] = [];
  for (const name of entries.sort()) {
    try {
      proposals.push(
        validateWorkflowStructureChangeProposal(
          YAML.parse(readFileSync(join(workflowChangesDir(), name), "utf-8")),
        ),
      );
    } catch {
      /* validate command reports malformed proposals */
    }
  }
  return proposals;
}

/**
 * Record a workflow structure proposal (no SSOT mutation).
 * Requires findings from a prior evaluate (non-empty).
 * Apply still requires an approved `approval_id`.
 */
export function proposeWorkflowStructureChange(opts: {
  input: unknown;
  approvalId: string;
  proposedBy: string;
}): WorkflowStructureChangeProposal {
  const input = validateWorkflowStructureChangeInput(opts.input);
  if (!input.findings.length) {
    throw new Error("propose requires findings from evaluate (run evaluate first)");
  }
  // Re-check draft still parses; ensure findings were produced for this draft shape.
  evaluateWorkflowDocument(input.draft_document);

  const proposal = validateWorkflowStructureChangeProposal({
    ...input,
    change_id: nextChangeId(),
    approval_id: opts.approvalId,
    proposed_at: new Date().toISOString(),
    proposed_by: opts.proposedBy,
  });

  mkdirSync(workflowChangesDir(), { recursive: true });
  writeYamlFile(proposalPath(proposal.change_id), proposal);
  appendJsonl(workflowAuditPath(), {
    event_type: "workflow.structure.proposed",
    occurred_at: proposal.proposed_at,
    proposal: {
      change_id: proposal.change_id,
      approval_id: proposal.approval_id,
      workflow_id: proposal.workflow_id,
      grade: proposal.grade,
      proposed_by: proposal.proposed_by,
      reason: proposal.reason,
      findings_count: proposal.findings.length,
    },
  });
  return proposal;
}

export function describeWorkflowStructureChangeProposal(
  proposal: WorkflowStructureChangeProposal,
): string {
  return [
    `WFS proposal ${proposal.change_id}`,
    `workflow=${proposal.workflow_id}`,
    `grade=${proposal.grade}`,
    `approval=${proposal.approval_id}`,
    `findings=${proposal.findings.length}`,
  ].join(" · ");
}

export function applyWorkflowStructureChangeProposal(opts: {
  proposal: WorkflowStructureChangeProposal;
  appliedBy: string;
  dryRun?: boolean;
}): {
  logical_path: string;
  before_hash: string;
  after_hash: string;
  dry_run: boolean;
} {
  const proposal = workflowStructureChangeProposalSchema.parse(opts.proposal);
  assertApprovalReady(proposal.approval_id);

  if (proposal.grade === "C") {
    throw new Error("grade C is plan-only; apply is forbidden");
  }

  const next = workflowDocumentSchema.parse(proposal.proposed_document);
  if (next.workflow_id !== proposal.workflow_id) {
    throw new Error("proposed_document.workflow_id must match proposal.workflow_id");
  }

  const existing = loadWorkflowDocument(proposal.workflow_id);
  const beforeDoc =
    existing ??
    ({
      version: 1,
      workflow_id: proposal.workflow_id,
      kind: next.kind,
      title: "(missing)",
      nodes: [],
      edges: [],
    } satisfies WorkflowDocument);

  const beforeHash = documentHash(beforeDoc);
  const afterHash = documentHash(next);
  const logicalPath = workflowLogicalPath(proposal.workflow_id);

  if (opts.dryRun) {
    return {
      logical_path: logicalPath,
      before_hash: beforeHash,
      after_hash: afterHash,
      dry_run: true,
    };
  }

  const yamlBody = YAML.stringify(next);
  if (isFsGuardEnforced()) {
    writeTenantContentGuarded({
      agentId: "operations",
      logicalPath,
      content: yamlBody,
      runId: proposal.change_id,
      expectedSha256: existsSync(workflowYamlPath(proposal.workflow_id))
        ? currentCanonicalSha256(logicalPath)
        : undefined,
    });
  } else {
    writeWorkflowDocument(next);
  }

  const occurredAt = new Date().toISOString();
  appendJsonl(workflowAuditPath(), {
    event_type: "workflow.structure.applied",
    occurred_at: occurredAt,
    change_id: proposal.change_id,
    workflow_id: proposal.workflow_id,
    applied_by: opts.appliedBy,
    approval_id: proposal.approval_id,
    before_hash: beforeHash,
    after_hash: afterHash,
  });

  return {
    logical_path: logicalPath,
    before_hash: beforeHash,
    after_hash: afterHash,
    dry_run: false,
  };
}
