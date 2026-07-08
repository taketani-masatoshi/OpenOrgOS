import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { callStewardMcpTool } from "../src/lib/mcp/tools.js";
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

  it("denies steward_approve for operator role without approve permission", async () => {
    const result = await callStewardMcpTool(
      "steward_approve",
      { approval_id: "NOTICE-TEST" },
      { token: "demo-operator-key-2" }
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/forbidden/);
  });
});
