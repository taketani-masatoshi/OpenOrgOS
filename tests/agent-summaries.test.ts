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
  it("formats finance summary with runway TBD when cash unset", () => {
    const report = computeDashboard();
    const md = formatFinanceSummary(report);
    expect(md).toContain("Finance Agent 要約");
    expect(md).toContain("TBD");
    expect(md).toContain("cash-balance.yaml");
  });

  it("formats contract summary with draft CTRs", () => {
    const data = loadAllData();
    const report = computeDashboard(data);
    const md = formatContractSummary(data, report);
    expect(md).toContain("CTR-013");
    expect(md).toContain("CTR-014");
    expect(md).toContain("draft");
  });

  it("writes all agent summary files", () => {
    const report = computeDashboard();
    const paths = writeAgentSummaries(report);
    expect(existsSync(paths.finance)).toBe(true);
    expect(existsSync(paths.contract)).toBe(true);
    expect(existsSync(paths.prop001)).toBe(true);
    expect(existsSync(paths.prop002)).toBe(true);
    expect(existsSync(paths.compliance)).toBe(true);
    expect(existsSync(paths.operations)).toBe(true);
    expect(existsSync(paths.executive)).toBe(true);
    expect(paths.finance).toContain("dashboard-sync.md");
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
