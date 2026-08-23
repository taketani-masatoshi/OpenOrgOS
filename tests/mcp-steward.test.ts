import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { setTenantId } from "../src/lib/tenant.js";
import { getWorkspaceRoot } from "../src/lib/orgos-paths.js";
import { listStewardMcpTools, callStewardMcpTool, resetMcpRateLimitState } from "../src/lib/mcp/tools.js";
import { auditMcpToolCall } from "../src/lib/mcp/audit.js";
import { mcpOperatorUser } from "../src/lib/steward-chat/wire-witness.js";
import {
  DEMO_WITNESS_EVENT_ID,
  seedDemoWitnessEnvelope,
  startDemoWitnessHubs,
  type DemoWitnessHubs,
} from "./helpers/demo-witness-fixture.js";
import { enqueueWitnessPending, saveWitnessPending } from "../src/lib/protocol/witness-queue.js";

describe("mcp steward tools", () => {
  let witnessHubs: DemoWitnessHubs | undefined;
  let auditPath: string;
  const env = { ...process.env };

  beforeEach(async () => {
    setTenantId("demo");
    process.env.ORGOS_MCP_RATE_LIMIT = "0";
    resetMcpRateLimitState();
    auditPath = join(getWorkspaceRoot(), "data", ".orgos", "mcp-steward-test.jsonl");
    process.env.ORGOS_MCP_AUDIT_LOG = auditPath;
    if (existsSync(auditPath)) rmSync(auditPath, { force: true });

    spawnSync("node", ["--import", "tsx", "scripts/seed-demo-wire-skeleton.ts"], {
      cwd: process.cwd(),
      stdio: "pipe",
      env: { ...process.env, ORGOS_TENANT: "demo" },
    });

    const digest = seedDemoWitnessEnvelope("demo");
    saveWitnessPending({ pending: [] });
    enqueueWitnessPending({
      hub_id: "HUB-A",
      event_id: DEMO_WITNESS_EVENT_ID,
      side: "sent",
      envelope_digest: digest,
      last_error: "test pending",
    });

    witnessHubs = await startDemoWitnessHubs("demo");
  });

  afterEach(() => {
    witnessHubs?.close();
    witnessHubs = undefined;
    if (existsSync(auditPath)) rmSync(auditPath, { force: true });
    process.env = { ...env };
  });

  async function callWithAudit(tool: string, args: Record<string, unknown> = {}) {
    const token = "demo-operator-key";
    const user = mcpOperatorUser(token);
    let result: Awaited<ReturnType<typeof callStewardMcpTool>> | undefined;
    await auditMcpToolCall(tool, args, user.operator_id, user.approver_id, async () => {
      result = await callStewardMcpTool(tool, args, { token });
      return { ok: !result.isError, error: result.isError ? result.content[0]?.text : undefined };
    });
    return result!;
  }

  it("lists witness MCP tools", () => {
    const names = listStewardMcpTools().map((t) => t.name);
    expect(names).toContain("steward_witness_register");
    expect(names).toContain("steward_witness_verify");
    expect(names).toContain("steward_witness_flush");
  });

  it("returns today context markdown", async () => {
    const result = await callWithAudit("steward_today");
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toMatch(/Today|Wire|Witness/i);
  });

  it("registers sent/received and verifies quorum via MCP tools", async () => {
    for (const side of ["sent", "received"] as const) {
      const register = await callWithAudit("steward_witness_register", {
        event_id: DEMO_WITNESS_EVENT_ID,
        side,
      });
      expect(register.isError).toBeFalsy();
    }

    const verify = await callWithAudit("steward_witness_verify", {
      event_id: DEMO_WITNESS_EVENT_ID,
    });
    expect(verify.isError).toBeFalsy();
    const parsed = JSON.parse(verify.content[0]!.text) as { quorum: { satisfied: boolean } };
    expect(parsed.quorum.satisfied).toBe(true);

    mkdirSync(dirname(auditPath), { recursive: true });
    const lines = readFileSync(auditPath, "utf-8").trim().split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    const tools = lines.map((l) => (JSON.parse(l) as { tool: string }).tool);
    expect(tools).toContain("steward_witness_register");
    expect(tools).toContain("steward_witness_verify");
  });

  it("enforces MCP rate limit per tool", async () => {
    process.env.ORGOS_MCP_RATE_LIMIT = "1";
    process.env.ORGOS_MCP_RATE_LIMIT_MAX = "2";
    resetMcpRateLimitState();

    const first = await callStewardMcpTool("steward_today");
    expect(first.isError).toBeFalsy();
    const second = await callStewardMcpTool("steward_today");
    expect(second.isError).toBeFalsy();
    const third = await callStewardMcpTool("steward_today");
    expect(third.isError).toBe(true);
    expect(third.content[0]?.text).toBe("mcp_rate_limit_exceeded");
  });
});
