import { describe, it, expect } from "vitest";
import {
  computeDashboard,
  formatDashboardMarkdown,
} from "../src/lib/dashboard.js";
import {
  writeAgentSummaries,
  formatFinanceSummary,
  formatContractSummary,
  formatAgentSummariesSection,
} from "../src/lib/agent-summaries.js";
import { loadAllData } from "../src/lib/data.js";
import { existsSync } from "node:fs";

describe("agent-summaries", () => {
  it("formats finance summary with confirmed cash balance", () => {
    const report = computeDashboard();
    const md = formatFinanceSummary(report);
    expect(md).toContain("Finance Agent 要約");
    expect(md).toContain("cash-balance.yaml");
    expect(md).not.toContain("cash-balance.yaml 未確定");
  });

  it("formats contract summary with draft CTRs", () => {
    const data = loadAllData();
    const report = computeDashboard(data);
    const md = formatContractSummary(data, report);
    expect(md).toContain("CTR-013");
    expect(md).toContain("CTR-014");
    expect(md).toContain("draft");
  });

  it("writes agent summary files for enabled modules only", () => {
    const report = computeDashboard();
    const paths = writeAgentSummaries(report);
    expect(existsSync(paths.finance)).toBe(true);
    expect(existsSync(paths.contract)).toBe(true);
    expect(paths.modules.length).toBeGreaterThan(0);
    expect(existsSync(paths.compliance)).toBe(true);
    expect(existsSync(paths.operations)).toBe(true);
    expect(existsSync(paths.executive)).toBe(true);
    expect(paths.finance).toContain("dashboard-sync.md");
    const rental = paths.modules.find((m) => m.agent === "rental");
    expect(rental).toBeDefined();
    expect(existsSync(rental!.path)).toBe(true);
  });

  it("embeds agent summaries section in dashboard markdown", () => {
    const report = computeDashboard();
    const paths = writeAgentSummaries(report);
    const section = formatAgentSummariesSection(paths);
    const md = formatDashboardMarkdown(report, section);
    expect(md).toContain("## Agent 要約");
    expect(md).toContain("agent-summaries");
    expect(md).toContain("executive-notes");
  });
});
