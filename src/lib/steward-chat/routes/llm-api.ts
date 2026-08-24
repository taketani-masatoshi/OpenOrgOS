import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireBudgetSurfacePermission } from "../../console-auth/surface-guard.js";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  readJsonLimited,
} from "../../http/read-json-limited.js";
import { llmWorkersConfigSchema } from "../../../../schemas/llm-workers.js";
import {
  isWorkerKeyConfigured,
  loadLlmWorkersConfig,
  loadLlmWorkersConfigFile,
  saveLlmWorkersConfig,
} from "../../llm-pool/registry.js";
import { probeWorker } from "../../llm-pool/health.js";
import {
  getLlmPoolQueueSnapshot,
  setLlmPoolConfigOverride,
} from "../../llm-pool/router.js";
import {
  clearWorkerUnhealthy,
  getTotalInflight,
  snapshotWorkerStats,
} from "../../llm-pool/stats.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function formatRouteError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message}`;
      })
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

function publicWorkersPayload() {
  const config = loadLlmWorkersConfig();
  const stats = snapshotWorkerStats(config.workers);
  const byId = new Map(stats.map((s) => [s.worker_id, s]));
  const queue = getLlmPoolQueueSnapshot();
  return {
    ok: true as const,
    file_present: loadLlmWorkersConfigFile() !== null,
    queue: {
      ...config.queue,
      queued: queue.queued,
      inflight: getTotalInflight(),
    },
    workers: config.workers.map((w) => {
      const s = byId.get(w.id);
      return {
        id: w.id,
        label: w.label,
        tier: w.tier,
        provider: w.provider,
        base_url: w.base_url,
        model: w.model,
        max_inflight: w.max_inflight,
        enabled: w.enabled,
        api_key_env: w.api_key_env,
        supports_tools: w.supports_tools,
        key_configured: isWorkerKeyConfigured(w),
        healthy: s?.healthy ?? true,
        inflight: s?.inflight ?? 0,
        avg_latency_ms: s?.avg_latency_ms ?? 0,
        last_error: s?.last_error ?? null,
        last_ok_at: s?.last_ok_at ?? null,
      };
    }),
  };
}

/**
 * LLM worker pool HTTP surface for Steward Chat.
 * Never returns API key material — only env var names and key_configured.
 */
export async function handleLlmApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  if (!pathname.startsWith("/chat/v1/llm/")) return false;

  if (pathname === "/chat/v1/llm/workers" && method === "GET") {
    if (!requireBudgetSurfacePermission(user, "chat:read", res)) return true;
    try {
      json(res, 200, publicWorkersPayload());
    } catch (error) {
      json(res, 422, { ok: false, error: formatRouteError(error) });
    }
    return true;
  }

  if (pathname === "/chat/v1/llm/workers" && method === "PUT") {
    if (!requireBudgetSurfacePermission(user, "llm:admin", res)) return true;
    try {
      const raw = await readJsonLimited(req, 256 * 1024);
      const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const config = llmWorkersConfigSchema.parse({
        ...body,
        schema: "orgos.llm.workers.v1",
      });
      saveLlmWorkersConfig(config);
      setLlmPoolConfigOverride(null);
      json(res, 200, publicWorkersPayload());
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        json(res, 413, { ok: false, error: "payload_too_large" });
        return true;
      }
      if (error instanceof InvalidJsonError) {
        json(res, 400, { ok: false, error: "invalid_json" });
        return true;
      }
      json(res, 422, { ok: false, error: formatRouteError(error) });
    }
    return true;
  }

  const probeMatch = pathname.match(/^\/chat\/v1\/llm\/workers\/([^/]+)\/probe$/);
  if (probeMatch && method === "POST") {
    if (!requireBudgetSurfacePermission(user, "llm:admin", res)) return true;
    const workerId = decodeURIComponent(probeMatch[1]!);
    try {
      const config = loadLlmWorkersConfig();
      const worker = config.workers.find((w) => w.id === workerId);
      if (!worker) {
        json(res, 404, { ok: false, error: `worker not found: ${workerId}` });
        return true;
      }
      const result = await probeWorker(worker);
      if (result.ok) clearWorkerUnhealthy(worker.id);
      json(res, 200, {
        ok: true,
        worker_id: worker.id,
        probe: result,
      });
    } catch (error) {
      json(res, 422, { ok: false, error: formatRouteError(error) });
    }
    return true;
  }

  // Stub routes referenced by older SPA client — return empty/ok placeholders.
  if (pathname === "/chat/v1/llm/dashboard" && method === "GET") {
    if (!requireBudgetSurfacePermission(user, "chat:read", res)) return true;
    const payload = publicWorkersPayload();
    json(res, 200, {
      ok: true,
      workers: payload.workers,
      queue: payload.queue,
      budgets: [],
      models: [],
      pending_requests: [],
    });
    return true;
  }

  return false;
}
