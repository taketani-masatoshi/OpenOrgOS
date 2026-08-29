import { describe, expect, it } from "vitest";
import {
  findProviderByTool,
  formatFactGroundingLines,
  listFactProviders,
  matchProviderByIntent,
  matchProviderByTopic,
} from "../src/lib/operator-facts/registry.js";
import { listOperatorToolDefinitions } from "../src/lib/operator-runtime/tools.js";
import { formatChatGroundingBlock } from "../src/lib/steward-chat/chat-grounding.js";

describe("operator facts registry", () => {
  it("lists providers with unique tool names", () => {
    const providers = listFactProviders();
    expect(providers.length).toBeGreaterThanOrEqual(3);
    const names = providers.map((p) => p.toolName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("resolves tools by name", () => {
    expect(findProviderByTool("operator_hr_headcount")?.id).toBe("hr_headcount");
    expect(findProviderByTool("operator_company_officers")?.id).toBe(
      "company_officers"
    );
    expect(findProviderByTool("operator_finance_metrics")?.id).toBe(
      "finance_metrics"
    );
    expect(findProviderByTool("operator_contract_status")?.id).toBe(
      "contract_status"
    );
    expect(findProviderByTool("operator_sales_outbound")?.id).toBe(
      "sales_outbound"
    );
    expect(findProviderByTool("operator_cash_counterparties")?.id).toBe(
      "cash_counterparties"
    );
  });

  it("registers fact tools on the operator tool list", () => {
    const tools = listOperatorToolDefinitions();
    const names = tools.map((t) => t.function.name);
    expect(names).toContain("operator_hr_headcount");
    expect(names).toContain("operator_company_officers");
    expect(names).toContain("operator_finance_metrics");
    expect(names).toContain("operator_contract_status");
    expect(names).toContain("operator_sales_outbound");
    expect(names).toContain("operator_cash_counterparties");
  });

  it("generates grounding lines from registry", () => {
    const lines = formatFactGroundingLines();
    expect(lines.some((l) => /headcount|従業員/.test(l))).toBe(true);
    const block = formatChatGroundingBlock();
    expect(block).toContain("Grounding rules");
    expect(block).toContain("operator_hr_headcount");
  });

  it("does not steal orchestration phrases into HR intent", () => {
    expect(matchProviderByIntent("人事に確認して")).toBeUndefined();
  });

  it("does not match generic checklist phrasing to sales outbound topic", () => {
    expect(matchProviderByTopic("チェックリストを作って")?.id).not.toBe(
      "sales_outbound"
    );
  });
});
