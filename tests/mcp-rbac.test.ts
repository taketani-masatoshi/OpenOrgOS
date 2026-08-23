import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { callStewardMcpTool, listStewardMcpTools } from "../src/lib/mcp/tools.js";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";

describe("mcp rbac", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    clearOperatorsRegistryCacheForTests();
    process.env.ORGOS_MCP_RATE_LIMIT = "0";
  });

  afterEach(() => {
    process.env = { ...env };
    clearOperatorsRegistryCacheForTests();
  });

  it("allows steward_today for operator key", async () => {
    const result = await callStewardMcpTool("steward_today", {}, { token: "demo-operator-key" });
    expect(result.isError).not.toBe(true);
    expect(result.content[0]?.text).toContain("Today");
  });

  it("does not list steward_approve", () => {
    const names = listStewardMcpTools().map((t) => t.name);
    expect(names).not.toContain("steward_approve");
  });

  it("rejects steward_approve for any MCP caller", async () => {
    const result = await callStewardMcpTool(
      "steward_approve",
      { approval_id: "NOTICE-TEST" },
      { token: "demo-operator-key" }
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/not available|cannot approve|org approval approve/i);
  });

  it("does not grant ceo permissions without a token", async () => {
    delete process.env.ORGOS_MCP_TOKEN;
    const result = await callStewardMcpTool("steward_wire_flush", {});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/forbidden|chat:wire/);
  });
});
