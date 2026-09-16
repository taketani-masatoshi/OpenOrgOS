import type { LlmWorker } from "../../../schemas/llm-workers.js";
import {
  isWorkerKeyConfigured,
  resolveWorkerApiKey,
  resolveWorkerBaseUrl,
} from "./registry.js";

export type WorkerProbeResult = {
  ok: boolean;
  detail: string;
  latency_ms: number;
};

export type WorkerModelsResult = {
  models: string[];
};

/** List models exposed by a local OpenAI-compatible runtime such as Ollama. */
export async function listWorkerModels(
  worker: LlmWorker,
): Promise<WorkerModelsResult> {
  if (worker.tier !== "local" || worker.provider !== "openai-compatible") {
    throw new Error(
      "Model discovery is only available for local OpenAI-compatible workers",
    );
  }
  const base = resolveWorkerBaseUrl(worker);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`${base}/models`, {
      headers: {
        Authorization: `Bearer ${resolveWorkerApiKey(worker) || "ollama"}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const body = (await res.json()) as { data?: Array<{ id?: unknown }> };
    const models = Array.from(
      new Set(
        (body.data ?? [])
          .map((entry) => (typeof entry.id === "string" ? entry.id.trim() : ""))
          .filter((model) => model.length > 0 && model.length <= 200),
      ),
    ).sort((a, b) => a.localeCompare(b));
    return { models: models.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * OpenAI-compatible: GET {base}/models
 * Anthropic: key presence check (no cheap public health endpoint without spend).
 */
export async function probeWorker(worker: LlmWorker): Promise<WorkerProbeResult> {
  const started = Date.now();
  if (worker.base_url.startsWith("mock://")) {
    return { ok: true, detail: "mock", latency_ms: Date.now() - started };
  }

  if (worker.tier === "cloud" && !isWorkerKeyConfigured(worker)) {
    return {
      ok: false,
      detail: `API key not set${worker.api_key_env ? ` (${worker.api_key_env})` : ""}`,
      latency_ms: Date.now() - started,
    };
  }

  if (worker.provider === "anthropic") {
    return {
      ok: true,
      detail: "key configured",
      latency_ms: Date.now() - started,
    };
  }

  const base = resolveWorkerBaseUrl(worker);
  const url = `${base}/models`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${resolveWorkerApiKey(worker) || "ollama"}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latency_ms = Date.now() - started;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        detail: `HTTP ${res.status}: ${body.slice(0, 200)}`,
        latency_ms,
      };
    }
    return { ok: true, detail: "ok", latency_ms };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      latency_ms: Date.now() - started,
    };
  }
}
