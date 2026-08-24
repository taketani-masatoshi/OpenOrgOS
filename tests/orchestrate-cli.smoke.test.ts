import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { handoffSchema } from "../schemas/routing.js";
import { setTenantId } from "../src/lib/tenant.js";
import { routingQueueDir, writeHandoffFiles } from "../src/lib/routing.js";

const root = join(import.meta.dirname, "..");

function runOrgos(args: string[], env: Record<string, string> = {}) {
  return spawnSync("node", ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: root,
    encoding: "utf-8",
    env: { ...process.env, ORGOS_SUPPRESS_LEGACY_WARN: "1", ...env },
  });
}

describe("orchestrate CLI smoke", () => {
  const created: string[] = [];

  beforeEach(() => {
    setTenantId("mal");
  });

  afterEach(() => {
    for (const id of created) {
      for (const ext of [".yaml", ".md"]) {
        const path = join(routingQueueDir(), `${id}${ext}`);
        if (existsSync(path)) rmSync(path);
      }
    }
  });

  it("orchestrate --help lists subcommands", () => {
    const result = runOrgos(["orchestrate", "--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("plan");
    expect(result.stdout).toContain("status");
    expect(result.stdout).toContain("retry");
  });

  it("orchestrate plan --help lists --propose", () => {
    const result = runOrgos(["orchestrate", "plan", "--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("propose");
  });

  it("orchestrate status --json returns AIA envelope", () => {
    const parent = handoffSchema.parse({
      id: "IMP-CLI-SMOKE-P",
      created_at: new Date().toISOString(),
      from_agent: "executive_steward",
      to_agent: "executive_steward",
      task_type: "implement",
      access: { allowed: true, reason: "cli smoke" },
      context: { text: "smoke" },
      status: "pending",
      child_ids: ["IMP-CLI-SMOKE-A"],
    });
    writeHandoffFiles(parent, undefined, { audit: false });
    created.push(parent.id);

    const child = handoffSchema.parse({
      id: "IMP-CLI-SMOKE-A",
      created_at: new Date().toISOString(),
      from_agent: "executive_steward",
      to_agent: "finance",
      task_type: "implement",
      access: { allowed: true, reason: "cli smoke" },
      context: { text: "smoke" },
      status: "pending",
      parent_id: parent.id,
      depends_on: [],
      agent_prompt_path: "prompts/IMP-CLI-SMOKE-A_finance.md",
    });
    writeHandoffFiles(child, undefined, { audit: false });
    mkdirSync(join(routingQueueDir(), "prompts"), { recursive: true });
    writeFileSync(join(routingQueueDir(), child.agent_prompt_path!), "# smoke", "utf-8");
    created.push(child.id);

    const result = runOrgos(["orchestrate", "status", "--id", parent.id, "--json"]);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as { rootId: string; aia: { tier: string } };
    expect(payload.rootId).toBe(parent.id);
    expect(payload.aia.tier).toBeTruthy();
  });

  it("plan --write → run --dry-run → status --json full CLI flow", () => {
    const devEnv = {
      ORGOS_ENV: "development",
      ORGOS_TENANT: "mal",
      ORGOS_LLM_MOCK: "1",
      ORGOS_SHELL_PROFILE_AUTO: "0",
    };

    const planResult = runOrgos(
      [
        "orchestrate",
        "plan",
        "--write",
        "--json",
        "--text",
        "finance cash balance review",
        "--path",
        "data/finance/cash-balance.yaml",
      ],
      devEnv,
    );
    expect(planResult.status, planResult.stderr).toBe(0);
    const planned = JSON.parse(planResult.stdout) as { rootId: string; workOrderIds: string[] };
    expect(planned.rootId).toMatch(/^IMP-/);
    expect(planned.workOrderIds.length).toBeGreaterThan(0);
    created.push(planned.rootId, ...planned.workOrderIds);

    const runResult = runOrgos(
      ["orchestrate", "run", "--id", planned.rootId, "--dry-run"],
      devEnv,
    );
    expect(runResult.status, runResult.stderr).toBe(0);
    expect(runResult.stdout).toContain("Dispatch");

    const statusResult = runOrgos(
      ["orchestrate", "status", "--id", planned.rootId, "--json"],
      devEnv,
    );
    expect(statusResult.status, statusResult.stderr).toBe(0);
    const statusPayload = JSON.parse(statusResult.stdout) as { rootId: string; nodeCount: number };
    expect(statusPayload.rootId).toBe(planned.rootId);
    expect(statusPayload.nodeCount).toBeGreaterThan(0);
  });

  it("orchestrate plan --propose --json returns validation envelope", () => {
    const result = runOrgos(
      [
        "orchestrate",
        "plan",
        "--propose",
        "--json",
        "--text",
        "finance cash balance review",
        "--path",
        "data/finance/cash-balance.yaml",
      ],
      { ORGOS_ENV: "development", ORGOS_TENANT: "mal" },
    );
    expect(result.status, result.stderr).toBe(0);
    const proposal = JSON.parse(result.stdout) as {
      source: string;
      validation: { ok: boolean };
      plan: { agents: string[] };
    };
    expect(proposal.source).toBe("deterministic");
    expect(proposal.validation.ok).toBe(true);
    expect(proposal.plan.agents.length).toBeGreaterThan(0);
  });
});
