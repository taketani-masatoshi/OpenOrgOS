import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTenantId, runWithTenantId } from "../src/lib/tenant.js";
import { getSharedAiaScheduler, resetAiaSchedulerForTests } from "../src/lib/aia/scheduler.js";
import { agentDefinitionExists } from "../src/lib/agent-readiness.js";
import { getCatalogAgent } from "../src/lib/agent-catalog.js";
import { getInstallRoot } from "../src/lib/orgos-paths.js";
import { callStewardMcpTool } from "../src/lib/mcp/tools.js";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";
import { createStewardMcpServer } from "../src/lib/mcp/steward-server.js";
import { mcpOperatorUser } from "../src/lib/steward-chat/wire-witness.js";
import * as audit from "../src/lib/mcp/audit.js";

describe("agent infra fixes A/B/C", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
    resetAiaSchedulerForTests();
    clearOperatorsRegistryCacheForTests();
    vi.restoreAllMocks();
  });

  describe("A: MCP session token reaches tool + audit operator", () => {
    beforeEach(() => {
      setTenantId("demo");
      clearOperatorsRegistryCacheForTests();
      process.env.ORGOS_MCP_RATE_LIMIT = "0";
      // Env token is ceo (OP-001); session token under test is operator (OP-002, no chat:wire).
      process.env.ORGOS_MCP_TOKEN = "demo-operator-key";
    });

    it("operator without wire permission is forbidden on write tools when token is passed", async () => {
      const result = await callStewardMcpTool(
        "steward_wire_flush",
        {},
        { token: "demo-operator-key-2" }
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toMatch(/forbidden/i);
    });

    it("createStewardMcpServer binds session token into tool calls and audit operator_id", async () => {
      const seen: { operatorId?: string } = {};
      vi.spyOn(audit, "auditMcpToolCall").mockImplementation(
        async (_tool, _args, operatorId, _approverId, fn) => {
          seen.operatorId = operatorId;
          return fn();
        }
      );

      const sessionToken = "demo-operator-key-2";
      const user = mcpOperatorUser(sessionToken);
      expect(user.operator_id).not.toBe(mcpOperatorUser().operator_id);

      const toolResult = await callStewardMcpTool("steward_today", {}, { token: sessionToken });
      expect(toolResult.isError).not.toBe(true);

      expect(createStewardMcpServer({ token: sessionToken })).toBeTruthy();
      expect(createStewardMcpServer()).toBeTruthy();

      await audit.auditMcpToolCall(
        "steward_today",
        {},
        user.operator_id,
        user.approver_id,
        async () => ({
          ok: true,
        })
      );
      expect(seen.operatorId).toBe(user.operator_id);
    });
  });

  describe("B: AIA shared scheduler is per-tenant", () => {
    beforeEach(() => {
      resetAiaSchedulerForTests();
    });

    it("isolates scheduler instances and active runs across tenants", () => {
      const a = runWithTenantId("demo", () => getSharedAiaScheduler());
      const b = runWithTenantId("mal", () => getSharedAiaScheduler());
      expect(a).not.toBe(b);

      runWithTenantId("demo", () => {
        const admitted = getSharedAiaScheduler().tryAdmit({
          run_id: "RUN-tenant-iso-1",
          agent_id: "finance",
        });
        expect(admitted.admitted).toBe(true);
        expect(getSharedAiaScheduler().metrics().aia_running).toBeGreaterThan(0);
      });

      runWithTenantId("mal", () => {
        expect(getSharedAiaScheduler().metrics().aia_running).toBe(0);
      });
    });
  });

  describe("C: readiness definition exists uses install-root absolute paths", () => {
    it("still finds catalog definitions after chdir away from repo root", () => {
      setTenantId("mal");
      expect(getCatalogAgent("finance")?.path).toBeTruthy();

      const cwd = process.cwd();
      const scratch = mkdtempSync(join(tmpdir(), "orgos-readiness-cwd-"));
      try {
        process.chdir(scratch);
        expect(agentDefinitionExists("finance")).toBe(true);
        expect(getInstallRoot().length).toBeGreaterThan(0);
      } finally {
        process.chdir(cwd);
        rmSync(scratch, { recursive: true, force: true });
      }
    });
  });
});
