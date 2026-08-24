import type { LlmWorker } from "../../../schemas/llm-workers.js";
import { resolveWorkerApiKey } from "./registry.js";

export type WorkerProbeResult = {
  ok: boolean;
  detail: string;
  latency_ms: number;
};

/**
 * OpenAI-compatible: GET {base}/models
 * Anthropic: key presence check (no cheap public health endpoint without spend).
 */
export async function probeWorker(worker: LlmWorker): Promise<WorkerProbeResult> {
  const started = Date.now();
  if (worker.base_url.startsWith("mock://")) {
    return { ok: true, detail: "mock", latency_ms: Date.now() - started };
  }

  if (worker.provider === "anthropic") {
    const key = resolveWorkerApiKey(worker);
    if (!key) {
      return {
        ok: false,
        detail: `API key not set${worker.api_key_env ? ` (${worker.api_key_env})` : ""}`,
        latency_ms: Date.now() - started,
      };
    }
    return {
      ok: true,
      detail: "key configured",
      latency_ms: Date.now() - started,
    };
  }

  const base = worker.base_url.replace(/\/$/, "");
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
