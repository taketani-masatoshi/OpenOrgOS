import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { llmWorkersConfigSchema } from "../schemas/llm-workers.js";
import {
  LlmPoolError,
  resetLlmPoolRouterForTests,
  setLlmPoolConfigOverride,
  withLlmWorker,
} from "../src/lib/llm-pool/router.js";
import {
  beginWorkerInflight,
  getWorkerInflight,
  resetLlmPoolStatsForTests,
} from "../src/lib/llm-pool/stats.js";
import { probeWorker } from "../src/lib/llm-pool/health.js";
import {
  isWorkerKeyConfigured,
  resolveWorkerApiKey,
  workerToLlmApiConfig,
} from "../src/lib/llm-pool/registry.js";
import type { LlmWorker } from "../schemas/llm-workers.js";

function worker(
  partial: Partial<LlmWorker> & Pick<LlmWorker, "id" | "tier">,
): LlmWorker {
  return {
    label: partial.id,
    provider: "openai-compatible",
    base_url: partial.tier === "cloud" ? "https://api.openai.com/v1" : "http://127.0.0.1:11434/v1",
    model: "test-model",
    max_inflight: 1,
    enabled: true,
    api_key_env: "",
    ...partial,
  };
}

describe("llm-pool router", () => {
  beforeEach(() => {
    resetLlmPoolStatsForTests();
    resetLlmPoolRouterForTests();
  });

  afterEach(() => {
    resetLlmPoolStatsForTests();
    resetLlmPoolRouterForTests();
    vi.useRealTimers();
  });

  it("picks least-inflight local worker", async () => {
    setLlmPoolConfigOverride(
      llmWorkersConfigSchema.parse({
        schema: "orgos.llm.workers.v1",
        workers: [
          worker({ id: "a", tier: "local", max_inflight: 2 }),
          worker({ id: "b", tier: "local", max_inflight: 2 }),
        ],
      }),
    );
    beginWorkerInflight("a");
    const seen: string[] = [];
    await withLlmWorker(async (lease) => {
      seen.push(lease.worker.id);
      return "ok";
    });
    expect(seen).toEqual(["b"]);
  });

  it("queues when local workers are at capacity", async () => {
    setLlmPoolConfigOverride(
      llmWorkersConfigSchema.parse({
        schema: "orgos.llm.workers.v1",
        queue: { max_queue: 4, queue_timeout_ms: 5_000, cloud_overflow: { enabled: false } },
        workers: [worker({ id: "solo", tier: "local", max_inflight: 1 })],
      }),
    );

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((r) => {
      releaseFirst = r;
    });

    const first = withLlmWorker(async (lease) => {
      expect(lease.worker.id).toBe("solo");
      await firstGate;
      return "first";
    });

    // Wait until first holds the slot.
    await vi.waitFor(() => expect(getWorkerInflight("solo")).toBe(1));

    const secondPromise = withLlmWorker(async (lease) => {
      expect(lease.worker.id).toBe("solo");
      expect(lease.queued_ms).toBeGreaterThanOrEqual(0);
      return "second";
    });

    releaseFirst();
    expect(await first).toBe("first");
    expect(await secondPromise).toBe("second");
  });

  it("overflows to cloud after wait threshold", async () => {
    vi.useFakeTimers();
    setLlmPoolConfigOverride(
      llmWorkersConfigSchema.parse({
        schema: "orgos.llm.workers.v1",
        queue: {
          max_queue: 8,
          queue_timeout_ms: 60_000,
          cloud_overflow: {
            enabled: true,
            wait_threshold_ms: 100,
            max_inflight: 2,
          },
        },
        workers: [
          worker({ id: "local-1", tier: "local", max_inflight: 1 }),
          worker({
            id: "cloud-1",
            tier: "cloud",
            base_url: "https://api.openai.com/v1",
            max_inflight: 2,
          }),
        ],
      }),
    );

    let releaseLocal!: () => void;
    const localGate = new Promise<void>((r) => {
      releaseLocal = r;
    });

    const localJob = withLlmWorker(async (lease) => {
      expect(lease.worker.id).toBe("local-1");
      await localGate;
      return "local";
    });
    await vi.waitFor(() => expect(getWorkerInflight("local-1")).toBe(1));

    const cloudJob = withLlmWorker(async (lease) => {
      expect(lease.worker.tier).toBe("cloud");
      return "cloud";
    });

    await vi.advanceTimersByTimeAsync(400);
    expect(await cloudJob).toBe("cloud");
    releaseLocal();
    expect(await localJob).toBe("local");
  });

  it("rejects when queue is full", async () => {
    setLlmPoolConfigOverride(
      llmWorkersConfigSchema.parse({
        schema: "orgos.llm.workers.v1",
        queue: { max_queue: 1, queue_timeout_ms: 5_000, cloud_overflow: { enabled: false } },
        workers: [worker({ id: "solo", tier: "local", max_inflight: 1 })],
      }),
    );

    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const hold = withLlmWorker(async () => {
      await gate;
      return "hold";
    });
    await vi.waitFor(() => expect(getWorkerInflight("solo")).toBe(1));

    // Fill the single queue slot.
    const queued = withLlmWorker(async () => "queued");
    await expect(
      withLlmWorker(async () => "too-many"),
    ).rejects.toBeInstanceOf(LlmPoolError);

    release();
    await hold;
    await queued;
  });

  it("leases the pinned worker when idle", async () => {
    setLlmPoolConfigOverride(
      llmWorkersConfigSchema.parse({
        schema: "orgos.llm.workers.v1",
        workers: [
          worker({ id: "a", tier: "local", max_inflight: 2 }),
          worker({ id: "b", tier: "local", max_inflight: 2 }),
        ],
      }),
    );
    const seen: string[] = [];
    await withLlmWorker(async (lease) => {
      seen.push(lease.worker.id);
      return "ok";
    }, { mode: "local", worker_id: "b" });
    expect(seen).toEqual(["b"]);
  });

  it("forces cloud when mode is cloud", async () => {
    setLlmPoolConfigOverride(
      llmWorkersConfigSchema.parse({
        schema: "orgos.llm.workers.v1",
        workers: [
          worker({ id: "local-1", tier: "local", max_inflight: 2 }),
          worker({
            id: "cloud-1",
            tier: "cloud",
            base_url: "https://api.openai.com/v1",
            max_inflight: 2,
          }),
        ],
      }),
    );
    const seen: string[] = [];
    await withLlmWorker(async (lease) => {
      seen.push(lease.worker.id);
      return "ok";
    }, { mode: "cloud" });
    expect(seen).toEqual(["cloud-1"]);
  });

  it("does not overflow to cloud when mode is local", async () => {
    vi.useFakeTimers();
    setLlmPoolConfigOverride(
      llmWorkersConfigSchema.parse({
        schema: "orgos.llm.workers.v1",
        queue: {
          max_queue: 8,
          queue_timeout_ms: 60_000,
          cloud_overflow: {
            enabled: true,
            wait_threshold_ms: 100,
            max_inflight: 2,
          },
        },
        workers: [
          worker({ id: "local-1", tier: "local", max_inflight: 1 }),
          worker({
            id: "cloud-1",
            tier: "cloud",
            base_url: "https://api.openai.com/v1",
            max_inflight: 2,
          }),
        ],
      }),
    );

    let releaseLocal!: () => void;
    const localGate = new Promise<void>((r) => {
      releaseLocal = r;
    });
    const localJob = withLlmWorker(async () => {
      await localGate;
      return "local";
    }, { mode: "local" });
    await vi.waitFor(() => expect(getWorkerInflight("local-1")).toBe(1));

    const queued = withLlmWorker(async (lease) => lease.worker.id, { mode: "local" });
    await vi.advanceTimersByTimeAsync(400);
    expect(getWorkerInflight("cloud-1")).toBe(0);

    releaseLocal();
    expect(await localJob).toBe("local");
    expect(await queued).toBe("local-1");
  });

  it("pins a worker id and does not retry another worker", async () => {
    setLlmPoolConfigOverride(
      llmWorkersConfigSchema.parse({
        schema: "orgos.llm.workers.v1",
        workers: [
          worker({ id: "bad", tier: "local", max_inflight: 1 }),
          worker({ id: "good", tier: "local", max_inflight: 1 }),
        ],
      }),
    );
    await expect(
      withLlmWorker(async () => {
        throw new Error("fetch failed ECONNREFUSED");
      }, { mode: "local", worker_id: "bad" }),
    ).rejects.toThrow(/ECONNREFUSED/);
    expect(getWorkerInflight("good")).toBe(0);
  });

  it("rejects when the requested worker is missing", async () => {
    setLlmPoolConfigOverride(
      llmWorkersConfigSchema.parse({
        schema: "orgos.llm.workers.v1",
        workers: [worker({ id: "solo", tier: "local" })],
      }),
    );
    await expect(
      withLlmWorker(async () => "ok", { mode: "local", worker_id: "missing" }),
    ).rejects.toMatchObject({
      message: "LLM worker not available: missing",
      code: "no_workers",
    });
  });

  it("rejects when no enabled cloud workers exist", async () => {
    setLlmPoolConfigOverride(
      llmWorkersConfigSchema.parse({
        schema: "orgos.llm.workers.v1",
        workers: [worker({ id: "solo", tier: "local" })],
      }),
    );
    await expect(
      withLlmWorker(async () => "ok", { mode: "cloud" }),
    ).rejects.toMatchObject({
      message: "No enabled cloud LLM workers",
      code: "no_workers",
    });
  });

  it("marks unhealthy and retries on transport error", async () => {
    setLlmPoolConfigOverride(
      llmWorkersConfigSchema.parse({
        schema: "orgos.llm.workers.v1",
        workers: [
          worker({ id: "bad", tier: "local", max_inflight: 1 }),
          worker({ id: "good", tier: "local", max_inflight: 1 }),
        ],
      }),
    );

    let attempts = 0;
    const result = await withLlmWorker(async (lease) => {
      attempts += 1;
      if (lease.worker.id === "bad") {
        throw new Error("fetch failed ECONNREFUSED");
      }
      return lease.worker.id;
    });
    expect(result).toBe("good");
    expect(attempts).toBe(2);
  });
});

describe("llm-pool registry key resolution", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("resolves api_key_env without embedding secrets in config objects", () => {
    process.env.MY_TEST_LLM_KEY = "sk-secret-value";
    const w = worker({
      id: "c1",
      tier: "cloud",
      api_key_env: "MY_TEST_LLM_KEY",
      base_url: "https://api.openai.com/v1",
    });
    expect(isWorkerKeyConfigured(w)).toBe(true);
    expect(resolveWorkerApiKey(w)).toBe("sk-secret-value");
    const cfg = workerToLlmApiConfig(w);
    expect(cfg.apiKey).toBe("sk-secret-value");
    // Worker row itself must not contain the secret.
    expect(JSON.stringify(w)).not.toContain("sk-secret-value");
  });

  it("does not fall back to ORGOS_LLM_API_KEY when api_key_env is named but empty", () => {
    process.env.ORGOS_LLM_API_KEY = "ollama";
    delete process.env.OLLAMA_API_KEY;
    const w = worker({
      id: "cloud-ollama",
      tier: "cloud",
      api_key_env: "OLLAMA_API_KEY",
      base_url: "https://ollama.com/v1",
    });
    expect(resolveWorkerApiKey(w)).toBe("");
    expect(isWorkerKeyConfigured(w)).toBe(false);
  });

  it("treats local openai-compatible as key-configured without env", () => {
    delete process.env.ORGOS_LLM_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const w = worker({ id: "ollama", tier: "local" });
    expect(isWorkerKeyConfigured(w)).toBe(true);
  });

  it("rewrites loopback worker base_url when ORGOS_LLM_API_URL is set (Docker → host Ollama)", () => {
    process.env.ORGOS_LLM_API_URL = "http://host.docker.internal:11434/v1";
    const w = worker({
      id: "local-01",
      tier: "local",
      base_url: "http://127.0.0.1:11434/v1",
    });
    expect(workerToLlmApiConfig(w).baseUrl).toBe("http://host.docker.internal:11434/v1");
  });

  it("probes the rewritten loopback URL (Docker → host Ollama)", async () => {
    process.env.ORGOS_LLM_API_URL = "http://host.docker.internal:11434/v1";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    const result = await probeWorker(
      worker({
        id: "local-01",
        tier: "local",
        base_url: "http://127.0.0.1:11434/v1",
      }),
    );
    expect(result.ok).toBe(true);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      "http://host.docker.internal:11434/v1/models",
    );
    fetchSpy.mockRestore();
  });

  it("does not probe Ollama Cloud until OLLAMA_API_KEY is set", async () => {
    delete process.env.OLLAMA_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await probeWorker(
      worker({
        id: "cloud-ollama",
        tier: "cloud",
        api_key_env: "OLLAMA_API_KEY",
        base_url: "https://ollama.com/v1",
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/OLLAMA_API_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
