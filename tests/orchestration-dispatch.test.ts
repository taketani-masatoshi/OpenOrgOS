import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { handoffSchema } from "../schemas/routing.js";
import { runDispatch } from "../src/lib/agent-dispatch.js";
import * as ask from "../src/lib/operator-runtime/ask.js";
import * as llmRegistry from "../src/lib/llm-pool/registry.js";
import {
  getSharedAiaScheduler,
  loadAiaRuntimeConfig,
  resetAiaSchedulerForTests,
  saveAiaRuntimeConfig,
} from "../src/lib/aia/scheduler.js";
import {
  formatOrchestrationStatus,
  retryFailedWorkOrders,
} from "../src/lib/orchestration/orchestrate-actions.js";
import {
  DISPATCH_MANIFEST_PREFIX,
  loadHandoff,
  routingQueueDir,
  writeHandoffFiles,
} from "../src/lib/routing.js";
import { setTenantId } from "../src/lib/tenant.js";

vi.mock("../src/lib/llm-pool/registry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/llm-pool/registry.js")>();
  return {
    ...actual,
    hasConfiguredLlmWorkers: vi.fn(() => actual.hasConfiguredLlmWorkers()),
  };
});

describe("orchestration dispatch integration", () => {
  const env = { ...process.env };
  const created: string[] = [];
  let runtimeSnapshot: ReturnType<typeof loadAiaRuntimeConfig> | undefined;

  beforeEach(() => {
    setTenantId("mal");
    runtimeSnapshot = loadAiaRuntimeConfig();
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
    if (runtimeSnapshot) {
      saveAiaRuntimeConfig(runtimeSnapshot);
      runtimeSnapshot = undefined;
    }
    resetAiaSchedulerForTests();
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
    // Clean orphan dispatch manifests created during runs
    const queueDir = routingQueueDir();
    if (existsSync(queueDir)) {
      for (const name of readdirSync(queueDir)) {
        if (name.startsWith(DISPATCH_MANIFEST_PREFIX) && name.endsWith(".yaml")) {
          rmSync(join(queueDir, name), { force: true });
        }
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
    } = {}
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
      "utf-8"
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

  it("runDispatch mode is portable_llm when ORGOS_LLM_MOCK=1", async () => {
    vi.spyOn(ask, "runOperatorDispatch").mockResolvedValue({
      ok: true,
      reply: "mock ok",
      stdout: "mock ok",
      stderr: "",
      detail: "mock ok",
      runtime: "llm-api",
    });

    const parent = writeWo("IMP-DISP-MODE-LLM-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DISP-MODE-LLM-A"],
    });
    writeWo("IMP-DISP-MODE-LLM-A", { parent_id: parent.id, to_agent: "finance" });

    const result = await runDispatch(parent.id);
    expect(result.mode).toBe("portable_llm");
    expect(result.results[0]?.ok).toBe(true);
  });

  it("runDispatch mode is portable_shell when ORGOS_SHELL_PROFILE is set", async () => {
    process.env.ORGOS_SHELL_PROFILE = "aider";
    vi.spyOn(ask, "runOperatorDispatch").mockResolvedValue({
      ok: true,
      reply: "shell ok",
      stdout: "shell ok",
      stderr: "",
      detail: "shell ok",
      runtime: "shell",
    });

    const parent = writeWo("IMP-DISP-MODE-SH-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DISP-MODE-SH-A"],
    });
    writeWo("IMP-DISP-MODE-SH-A", { parent_id: parent.id, to_agent: "finance" });

    const result = await runDispatch(parent.id);
    expect(result.mode).toBe("portable_shell");
    expect(result.results[0]?.ok).toBe(true);
  });

  it("runDispatch mode is manifest when no LLM/shell runtime is configured", async () => {
    delete process.env.ORGOS_LLM_MOCK;
    delete process.env.ORGOS_SHELL_PROFILE;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ORGOS_LLM_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ORGOS_ANTHROPIC_API_KEY;
    // mal ships configured LLM workers — force the no-runtime portable path.
    vi.mocked(llmRegistry.hasConfiguredLlmWorkers).mockReturnValue(false);
    const dispatchSpy = vi.spyOn(ask, "runOperatorDispatch");

    const parent = writeWo("IMP-DISP-MODE-MF-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DISP-MODE-MF-A"],
    });
    writeWo("IMP-DISP-MODE-MF-A", { parent_id: parent.id, to_agent: "finance" });

    const result = await runDispatch(parent.id);
    expect(result.mode).toBe("manifest");
    expect(result.results[0]?.ok).toBe(true);
    expect(result.results[0]?.detail).toMatch(/^manifest ·/);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it("marks work order failed when admission times out", async () => {
    saveAiaRuntimeConfig({
      ...loadAiaRuntimeConfig(),
      schema: "orgos.aia.runtime.v1",
      tier: "soft",
      max_concurrent_aia: 1,
      queue_timeout_seconds: 1,
      llm_backpressure: false,
    });
    resetAiaSchedulerForTests();

    const blocker = getSharedAiaScheduler().tryAdmit({
      run_id: "RUN-DISP-BLOCK",
      agent_id: "finance",
    });
    expect(blocker.admitted).toBe(true);

    vi.spyOn(ask, "runOperatorDispatch").mockResolvedValue({
      ok: true,
      reply: "should not run",
      stdout: "",
      stderr: "",
      detail: "should not run",
      runtime: "llm-api",
    });

    const parent = writeWo("IMP-DISP-ADM-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DISP-ADM-A"],
    });
    writeWo("IMP-DISP-ADM-A", { parent_id: parent.id, to_agent: "finance" });

    const result = await runDispatch(parent.id);
    expect(result.results[0]?.ok).toBe(false);
    expect(result.results[0]?.detail).toMatch(/admission timeout/i);
    expect(loadHandoff("IMP-DISP-ADM-A").status).toBe("failed");

    getSharedAiaScheduler().release("RUN-DISP-BLOCK", true);
  }, 15_000);

  it("stops after wave: 1 leaving dependent work orders pending", async () => {
    vi.spyOn(ask, "runOperatorDispatch").mockResolvedValue({
      ok: true,
      reply: "mock ok",
      stdout: "mock ok",
      stderr: "",
      detail: "mock ok",
      runtime: "llm-api",
    });

    const parent = writeWo("IMP-DISP-W1-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DISP-W1-A", "IMP-DISP-W1-B"],
    });
    writeWo("IMP-DISP-W1-A", { parent_id: parent.id, to_agent: "finance" });
    writeWo("IMP-DISP-W1-B", {
      parent_id: parent.id,
      to_agent: "operations",
      depends_on: ["IMP-DISP-W1-A"],
    });

    const result = await runDispatch(parent.id, { wave: 1 });
    expect(result.results.length).toBe(1);
    expect(result.results[0]?.work_order_id).toBe("IMP-DISP-W1-A");
    expect(loadHandoff("IMP-DISP-W1-A").status).toBe("completed");
    expect(loadHandoff("IMP-DISP-W1-B").status).toBe("pending");
  });

  it("dryRun writes nothing and leaves work orders pending", async () => {
    const parent = writeWo("IMP-DISP-DRY-P", {
      to_agent: "executive_steward",
      child_ids: ["IMP-DISP-DRY-A"],
    });
    writeWo("IMP-DISP-DRY-A", { parent_id: parent.id, to_agent: "finance" });

    const before = new Set(
      existsSync(routingQueueDir())
        ? readdirSync(routingQueueDir()).filter((n) => n.startsWith(DISPATCH_MANIFEST_PREFIX))
        : []
    );

    const result = await runDispatch(parent.id, { dryRun: true });
    expect(result.mode).toBe("manifest");
    expect(result.manifestPath).toBe("");
    expect(result.results).toEqual([]);
    expect(result.manifest.tasks.length).toBeGreaterThanOrEqual(1);

    const after = new Set(
      existsSync(routingQueueDir())
        ? readdirSync(routingQueueDir()).filter((n) => n.startsWith(DISPATCH_MANIFEST_PREFIX))
        : []
    );
    expect([...after].filter((n) => !before.has(n))).toEqual([]);
    expect(loadHandoff("IMP-DISP-DRY-A").status).toBe("pending");
  });
});
