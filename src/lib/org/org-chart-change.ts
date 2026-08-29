import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  orgChartChangeInputSchema,
  orgChartChangeProposalSchema,
  type OrgChartChangeInput,
  type OrgChartChangeProposal,
} from "../../../schemas/org/org-chart-change.js";
import { orgChartFileSchema, orgChartNodeSchema, type OrgChartFile } from "../../../schemas/org/org-chart.js";
import { findOrgApproval } from "./approval/approve.js";
import { orgChartYamlPath, loadOrgChart } from "./org-chart.js";
import { writeOrgChartSnapshot } from "./org-chart-history.js";
import { writeTenantContentGuarded } from "./fs-guard/guarded-write.js";
import { currentCanonicalSha256, isFsGuardEnforced } from "./fs-guard/index.js";
import { appendJsonl } from "../jsonl-store.js";
import { tenantDataPath } from "../tenant.js";
import { writeYamlFile } from "../utils.js";

export function validateOrgChartChangeInput(raw: unknown): OrgChartChangeInput {
  return orgChartChangeInputSchema.parse(raw);
}

export function validateOrgChartChangeProposal(raw: unknown): OrgChartChangeProposal {
  return orgChartChangeProposalSchema.parse(raw);
}

function chartHash(chart: OrgChartFile): string {
  const body = YAML.stringify(chart);
  return `sha256:${createHash("sha256").update(body, "utf-8").digest("hex")}`;
}

function orgChartAuditPath(): string {
  return tenantDataPath("org", "org-chart-change-audit.jsonl");
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

function applyMutation(chart: OrgChartFile, proposal: OrgChartChangeProposal): OrgChartFile {
  const nodes = [...chart.nodes];
  const idx = nodes.findIndex((n) => n.id === proposal.node_id);

  if (proposal.action === "add") {
    if (!proposal.node) throw new Error("add requires node");
    if (idx >= 0) throw new Error(`node already exists: ${proposal.node_id}`);
    nodes.push(proposal.node);
  } else if (proposal.action === "update") {
    if (idx < 0) throw new Error(`node not found: ${proposal.node_id}`);
    if (!proposal.changes) throw new Error("update requires changes");
    const current = nodes[idx]!;
    nodes[idx] = orgChartNodeSchema.parse({
      ...current,
      ...proposal.changes,
      id: proposal.node_id,
    });
  } else if (proposal.action === "remove") {
    if (idx < 0) throw new Error(`node not found: ${proposal.node_id}`);
    nodes.splice(idx, 1);
    for (const node of nodes) {
      if (node.reports_to === proposal.node_id) {
        throw new Error(`cannot remove ${proposal.node_id}: ${node.id} still reports_to it`);
      }
    }
  }

  return orgChartFileSchema.parse({ ...chart, nodes });
}

export function orgChartChangesDir(): string {
  return tenantDataPath("org", "org-chart-changes");
}

function proposalPath(changeId: string): string {
  return join(orgChartChangesDir(), `${changeId}.yaml`);
}

function nextChangeId(now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  let existing: string[] = [];
  try {
    existing = readdirSync(orgChartChangesDir());
  } catch {
    existing = [];
  }
  const prefix = `OCH-${day}-`;
  let max = 0;
  for (const name of existing) {
    if (!name.startsWith(prefix)) continue;
    const seq = Number.parseInt(name.slice(prefix.length, prefix.length + 3), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/** Load a stored proposal by id — shared by CLI and Console apply. */
export function loadOrgChartChangeProposal(changeId: string): OrgChartChangeProposal {
  const raw = readFileSync(proposalPath(changeId), "utf-8");
  return validateOrgChartChangeProposal(YAML.parse(raw));
}

export function listOrgChartChangeProposals(): OrgChartChangeProposal[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(orgChartChangesDir()).filter((n) => n.endsWith(".yaml"));
  } catch {
    return [];
  }
  const proposals: OrgChartChangeProposal[] = [];
  for (const name of entries.sort()) {
    try {
      proposals.push(
        validateOrgChartChangeProposal(
          YAML.parse(readFileSync(join(orgChartChangesDir(), name), "utf-8")),
        ),
      );
    } catch {
      /* validate command reports malformed proposals */
    }
  }
  return proposals;
}

/**
 * Record an org-chart change proposal (no chart mutation).
 * Apply still requires an approved `approval_id`.
 */
export function proposeOrgChartChange(opts: {
  input: unknown;
  approvalId: string;
  proposedBy: string;
}): OrgChartChangeProposal {
  const input = validateOrgChartChangeInput(opts.input);
  const proposal = validateOrgChartChangeProposal({
    ...input,
    change_id: nextChangeId(),
    approval_id: opts.approvalId,
    proposed_at: new Date().toISOString(),
    proposed_by: opts.proposedBy,
  });

  mkdirSync(orgChartChangesDir(), { recursive: true });
  writeYamlFile(proposalPath(proposal.change_id), proposal);
  appendJsonl(orgChartAuditPath(), {
    event_type: "org_chart.change.proposed",
    occurred_at: proposal.proposed_at,
    proposal,
  });
  return proposal;
}

export function describeOrgChartChangeProposal(proposal: OrgChartChangeProposal): string {
  return [
    `OCH proposal ${proposal.change_id}`,
    `intent=${proposal.intent} action=${proposal.action} node=${proposal.node_id}`,
    `approval=${proposal.approval_id} regulation=${proposal.regulation_ref.reg_id}`,
  ].join(" · ");
}

export function applyOrgChartChangeProposal(opts: {
  proposal: OrgChartChangeProposal;
  appliedBy: string;
  dryRun?: boolean;
}): {
  logical_path: string;
  before_hash: string;
  after_hash: string;
  dry_run: boolean;
} {
  const proposal = orgChartChangeProposalSchema.parse(opts.proposal);
  assertApprovalReady(proposal.approval_id);

  const chart = loadOrgChart();
  if (!chart) {
    throw new Error(`org chart missing: ${orgChartYamlPath()}`);
  }

  const beforeHash = chartHash(chart);
  const next = applyMutation(chart, proposal);
  const afterHash = chartHash(next);

  if (opts.dryRun) {
    return {
      logical_path: "data/org/org-chart.yaml",
      before_hash: beforeHash,
      after_hash: afterHash,
      dry_run: true,
    };
  }

  const yamlBody = YAML.stringify(next);
  const logicalPath = "data/org/org-chart.yaml";
  if (isFsGuardEnforced()) {
    writeTenantContentGuarded({
      agentId: "operations",
      logicalPath,
      content: yamlBody,
      runId: proposal.change_id,
      expectedSha256: currentCanonicalSha256(logicalPath),
    });
  } else {
    writeYamlFile(orgChartYamlPath(), next);
  }

  const occurredAt = new Date().toISOString();
  appendJsonl(orgChartAuditPath(), {
    event_type: "org_chart.change.applied",
    occurred_at: occurredAt,
    change_id: proposal.change_id,
    applied_by: opts.appliedBy,
    approval_id: proposal.approval_id,
    before_hash: beforeHash,
    after_hash: afterHash,
  });
  writeOrgChartSnapshot(chart, {
    source: "och_applied",
    recorded_at: occurredAt,
    change_id: `${proposal.change_id}-before`,
    approval_id: proposal.approval_id,
    notes: `適用前 · ${proposal.change_id}`,
  });
  writeOrgChartSnapshot(next, {
    source: "och_applied",
    recorded_at: occurredAt,
    change_id: proposal.change_id,
    approval_id: proposal.approval_id,
    notes: proposal.reason,
  });

  return {
    logical_path: logicalPath,
    before_hash: beforeHash,
    after_hash: afterHash,
    dry_run: false,
  };
}
