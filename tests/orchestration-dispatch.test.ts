import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { handoffSchema } from "../schemas/routing.js";
import { runDispatch } from "../src/lib/agent-dispatch.js";
import * as ask from "../src/lib/operator-runtime/ask.js";
import { resetAiaSchedulerForTests } from "../src/lib/aia/scheduler.js";
import { formatOrchestrationStatus, retryFailedWorkOrders } from "../src/lib/orchestration/orchestrate-actions.js";
import { loadHandoff, routingQueueDir, writeHandoffFiles } from "../src/lib/routing.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("orchestration dispatch integration", () => {
  const env = { ...process.env };
  const created: string[] = [];

  beforeEach(() => {
    setTenantId("mal");
    process.env = {
      ...env,
      ORGOS_LLM_MOCK: "1",
      ORGOS_SHELL_PROFILE_AUTO: "0",
    };
    delete process.env.ORGOS_SHELL_PROFILE;
    delete process.env.CURSOR_API_KEY;
    resetAiaSchedulerForTests();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
    for (const id of created) {
      for (const ext of [".yaml", ".md"]) {
        const path = join(routingQueueDir(), `${id}${ext}`);
        if (existsSync(path)) rmSync(path);
      }
      for (const agent of ["finance", "operations", "executive_steward"]) {
        const prompt = join(routingQueueDir(), "prompts", `${id}_${agent}.md`);
        if (existsSync(prompt)) rmSync(prompt);
      }
    }
  });

  function writeWo(
    id: string,
    opts: {
      to_agent?: "finance" | "operations" | "executive_steward";
      parent_id?: string;
      child_ids?: string[];
      depends_on?: string[];
      status?: string;
      dispatch?: { attempts?: number; max_attempts?: number };
    } = {},
  ) {
    const handoff = handoffSchema.parse({
      id,
      created_at: new Date().toISOString(),
      from_agent: "executive_steward",
      to_agent: opts.to_agent ?? "finance",
      task_type: "implement",
      access: { allowed: true, reason: "test" },
      context: { text: "dispatch integration test" },
      status: opts.status ?? "pending",
      parent_id: opts.parent_id,
      child_ids: opts.child_ids,
      depends_on: opts.depends_on ?? [],
      dispatch: opts.dispatch,
      agent_prompt_path: `prompts/${id}_${opts.to_agent ?? "finance"}.md`,
    });
    writeHandoffFiles(handoff, undefined, { audit: false });
    mkdirSync(join(routingQueueDir(), "prompts"), { recursive: true });
    writeFileSync(
      join(routingQueueDir(), handoff.agent_prompt_path!),
      "# Work order prompt\n\nRun validate.",
      "utf-8",
    );
    created.push(id);
    return handoff;
  }

  it("runDispatch executes dependency waves sequentially with mock LLM", async () => {
    vi.spyOn(ask, "runOperatorDispatch").mockResolvedValue({
      ok: true,
      reply: "mock ok",
      stdout: "mock ok",
      stderr: "",
      detail: "mock ok",
      runtime: "llm-api",
    });

    const parent = writeWo("IMP-DISP-WAVE-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DISP-WAVE-A", "IMP-DISP-WAVE-B"],
    });
    writeWo("IMP-DISP-WAVE-A", { parent_id: parent.id, to_agent: "finance" });
    writeWo("IMP-DISP-WAVE-B", {
      parent_id: parent.id,
      to_agent: "operations",
      depends_on: ["IMP-DISP-WAVE-A"],
    });

    const result = await runDispatch(parent.id, { parallel: 2 });
    expect(result.results.length).toBe(2);
    expect(result.results.every((row) => row.ok)).toBe(true);

    expect(loadHandoff("IMP-DISP-WAVE-A").status).toBe("completed");
    expect(loadHandoff("IMP-DISP-WAVE-B").status).toBe("completed");
    expect(loadHandoff("IMP-DISP-WAVE-A").dispatch?.attempts).toBe(1);
    expect(loadHandoff("IMP-DISP-WAVE-B").dispatch?.attempts).toBe(1);

    const status = formatOrchestrationStatus(parent.id);
    expect(status).toContain("## AIA runtime");
    expect(status).toContain("## AIA runs (plan)");
    expect(status).toContain("IMP-DISP-WAVE-A");
    expect(status).toContain("done");
  });

  it("retryFailedWorkOrders respects max_attempts and runDispatch can recover", async () => {
    const parent = writeWo("IMP-DISP-RET-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DISP-RET-A"],
    });
    writeWo("IMP-DISP-RET-A", {
      parent_id: parent.id,
      dispatch: { attempts: 0, max_attempts: 2 },
    });

    vi.spyOn(ask, "runOperatorDispatch").mockResolvedValueOnce({
      ok: false,
      reply: "mock failure",
      stdout: "",
      stderr: "",
      detail: "mock failure",
      runtime: "llm-api",
    });

    const failed = await runDispatch(parent.id);
    expect(failed.results[0]?.ok).toBe(false);
    expect(loadHandoff("IMP-DISP-RET-A").status).toBe("failed");
    expect(loadHandoff("IMP-DISP-RET-A").dispatch?.attempts).toBe(1);

    const retried = retryFailedWorkOrders(parent.id);
    expect(retried).toEqual(["IMP-DISP-RET-A"]);
    expect(loadHandoff("IMP-DISP-RET-A").status).toBe("pending");

    vi.spyOn(ask, "runOperatorDispatch").mockResolvedValueOnce({
      ok: true,
      reply: "mock ok",
      stdout: "mock ok",
      stderr: "",
      detail: "mock ok",
      runtime: "llm-api",
    });

    const recovered = await runDispatch(parent.id);
    expect(recovered.results[0]?.ok).toBe(true);
    expect(loadHandoff("IMP-DISP-RET-A").status).toBe("completed");
    expect(loadHandoff("IMP-DISP-RET-A").dispatch?.attempts).toBe(2);
  });

  it("does not retry when attempts reached max_attempts", async () => {
    const parent = writeWo("IMP-DISP-MAX-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DISP-MAX-A"],
    });
    writeWo("IMP-DISP-MAX-A", {
      parent_id: parent.id,
      status: "failed",
      dispatch: { attempts: 2, max_attempts: 2 },
    });

    const retried = retryFailedWorkOrders(parent.id);
    expect(retried).toEqual([]);
    expect(loadHandoff("IMP-DISP-MAX-A").status).toBe("failed");
  });
});
