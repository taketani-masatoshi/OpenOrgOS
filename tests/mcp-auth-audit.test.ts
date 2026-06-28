import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { appendMcpAudit } from "../src/lib/mcp/audit.js";
import { assertMcpAuthConfigured, isMcpAuthDisabled } from "../src/lib/mcp/auth.js";
import { getWorkspaceRoot } from "../src/lib/orgos-paths.js";

describe("mcp auth and audit", () => {
  const env = { ...process.env };
  let auditPath: string;

  beforeEach(() => {
    process.env = { ...env };
    auditPath = join(getWorkspaceRoot(), "data", ".orgos", "mcp-audit-test.jsonl");
    process.env.ORGOS_MCP_AUDIT_LOG = auditPath;
    if (existsSync(auditPath)) rmSync(auditPath, { force: true });
  });

  afterEach(() => {
    process.env = { ...env };
    if (existsSync(auditPath)) rmSync(auditPath, { force: true });
  });

  it("requires MCP token unless auth disabled", () => {
    delete process.env.ORGOS_MCP_AUTH;
    delete process.env.ORGOS_MCP_TOKEN;
    expect(() => assertMcpAuthConfigured()).toThrow(/ORGOS_MCP_TOKEN/);
    process.env.ORGOS_MCP_AUTH = "0";
    expect(() => assertMcpAuthConfigured()).not.toThrow();
  });

  it("appends audit log entries", () => {
    mkdirSync(dirname(auditPath), { recursive: true });
    appendMcpAudit({
      tool: "steward_today",
      operator_id: "test-op",
      approver_id: "CEO",
      ok: true,
    });
    const lines = readFileSync(auditPath, "utf-8").trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]!) as { tool: string; ok: boolean };
    expect(parsed.tool).toBe("steward_today");
    expect(parsed.ok).toBe(true);
  });

  it("blocks MCP auth off in production", () => {
    process.env.ORGOS_MCP_AUTH = "0";
    process.env.ORGOS_ENV = "production";
    expect(isMcpAuthDisabled()).toBe(true);
    expect(() => assertMcpAuthConfigured()).toThrow(/not allowed/);
  });
});
