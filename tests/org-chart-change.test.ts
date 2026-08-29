import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import {
  orgChartChangeProposalSchema,
} from "../schemas/org/org-chart-change.js";
import {
  applyOrgChartChangeProposal,
  describeOrgChartChangeProposal,
  listOrgChartChangeProposals,
  loadOrgChartChangeProposal,
  orgChartChangesDir,
  proposeOrgChartChange,
  validateOrgChartChangeInput,
} from "../src/lib/org/org-chart-change.js";
import { loadOrgChart } from "../src/lib/org/org-chart.js";
import { orgChartHistoryDir } from "../src/lib/org/org-chart-history.js";
import { writeYamlFile, getDataDir } from "../src/lib/utils.js";
import { orgChartFileSchema } from "../schemas/org/org-chart.js";
import {
  humanApproveOrgApproval,
  proposeOrgApproval,
} from "../src/lib/org/approval/index.js";
import { setTenantId } from "../src/lib/tenant.js";

import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";

function cleanupApprovals(): void {
  for (const p of [
    join(getDataDir(), "org", "pending-approvals.yaml"),
    join(getDataDir(), "protocol"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

function restoreDemoOrgChart(): void {
  const fixtureRoot = join(process.cwd(), "tests", "fixtures", "org-charts", "demo");
  const destOrg = join(getDataDir(), "org");
  mkdirSync(destOrg, { recursive: true });
  cpSync(join(fixtureRoot, "org-chart.yaml"), join(destOrg, "org-chart.yaml"), { force: true });
  const hist = orgChartHistoryDir();
  if (existsSync(hist)) rmSync(hist, { recursive: true, force: true });
  cpSync(join(fixtureRoot, "org-chart-history"), hist, { recursive: true, force: true });
}

describe("org chart change (OCH)", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanupApprovals();
    ensureProtocolSigningKey();
  });

  afterEach(() => {
    cleanupApprovals();
    restoreDemoOrgChart();
  });
  it("validates proposed change input", () => {
    const input = validateOrgChartChangeInput({
      intent: "display_correction",
      action: "update",
      node_id: "ceo",
      reason: "typo fix",
      regulation_ref: {
        reg_id: "REG-007",
        clause: "§1",
        artifact_path: "docs/company/regulations/bunsho-kanri-kisoku.md",
      },
      changes: { display_name: "CEO Office" },
    });
    expect(input.node_id).toBe("ceo");
  });

  it("describes proposal without applying", () => {
    const proposal = orgChartChangeProposalSchema.parse({
      change_id: "OCH-20260824-001",
      approval_id: "APR-20260824-001",
      proposed_at: new Date().toISOString(),
      proposed_by: "OP-001",
      intent: "display_correction",
      action: "update",
      node_id: "ceo",
      reason: "typo",
      regulation_ref: {
        reg_id: "REG-007",
        clause: "§1",
        artifact_path: "docs/company/regulations/bunsho-kanri-kisoku.md",
      },
      changes: { display_name: "CEO" },
    });
    expect(describeOrgChartChangeProposal(proposal)).toContain("OCH-20260824-001");
  });

  it("records a proposal with a generated OCH id and reloads it", () => {
    const proposal = proposeOrgChartChange({
      approvalId: "APR-20260824-001",
      proposedBy: "OP-001",
      input: {
        intent: "display_correction",
        action: "update",
        node_id: "ceo",
        reason: "typo fix",
        regulation_ref: {
          reg_id: "REG-007",
          clause: "§1",
          artifact_path: "docs/company/regulations/bunsho-kanri-kisoku.md",
        },
        changes: { display_name: "CEO Office" },
      },
    });
    expect(proposal.change_id).toMatch(/^OCH-\d{8}-\d{3}$/);
    expect(loadOrgChartChangeProposal(proposal.change_id).node_id).toBe("ceo");
    expect(
      listOrgChartChangeProposals().some((p) => p.change_id === proposal.change_id),
    ).toBe(true);
    rmSync(orgChartChangesDir(), { recursive: true, force: true });
  });

  it("rejects apply when the approval is not approved", () => {
    const approval = proposeOrgApproval({
      scope: "internal",
      subjectType: "org_chart.change",
      proposedBy: "secretary",
      subjectRef: "OCH-pending",
      message: "pending",
    });
    const proposal = orgChartChangeProposalSchema.parse({
      change_id: "OCH-20260824-009",
      approval_id: approval.approval_id,
      proposed_at: new Date().toISOString(),
      proposed_by: "OP-001",
      intent: "display_correction",
      action: "update",
      node_id: "ceo",
      reason: "typo",
      regulation_ref: {
        reg_id: "REG-007",
        clause: "§1",
        artifact_path: "docs/company/regulations/bunsho-kanri-kisoku.md",
      },
      changes: { display_name: "CEO Office" },
    });
    expect(() =>
      applyOrgChartChangeProposal({ proposal, appliedBy: "OP-001" }),
    ).toThrow(/not approved/);
  });

  it("applies approved display correction to org-chart.yaml", () => {
    const chartPath = join(getDataDir(), "org", "org-chart.yaml");
    writeYamlFile(
      chartPath,
      orgChartFileSchema.parse({
        version: 1,
        as_of: "2026-08-24",
        nodes: [
          {
            id: "ceo",
            display_name: "CEO Old",
            title: "CEO",
            function: "—",
            layer: "staff",
            board_role: "none",
          },
        ],
      }),
    );

    const approval = proposeOrgApproval({
      scope: "internal",
      subjectType: "org_chart.change",
      proposedBy: "secretary",
      subjectRef: "OCH-20260824-002",
      message: "display fix",
    });
    humanApproveOrgApproval({
      approvalId: approval.approval_id,
      approverId: "Demo CEO",
      operatorId: "OP-001",
      source: "cli",
    });

    const proposal = orgChartChangeProposalSchema.parse({
      change_id: "OCH-20260824-002",
      approval_id: approval.approval_id,
      proposed_at: new Date().toISOString(),
      proposed_by: "OP-001",
      intent: "display_correction",
      action: "update",
      node_id: "ceo",
      reason: "typo",
      regulation_ref: {
        reg_id: "REG-007",
        clause: "§1",
        artifact_path: "docs/company/regulations/bunsho-kanri-kisoku.md",
      },
      changes: { display_name: "CEO Office" },
    });

    const result = applyOrgChartChangeProposal({
      proposal,
      appliedBy: "OP-001",
    });
    expect(result.dry_run).toBe(false);
    const chart = loadOrgChart();
    expect(chart?.nodes.find((n) => n.id === "ceo")?.display_name).toBe("CEO Office");
    expect(
      existsSync(join(orgChartHistoryDir(), "2026-08-24--OCH-20260824-002.yaml")),
    ).toBe(true);
  });
});
