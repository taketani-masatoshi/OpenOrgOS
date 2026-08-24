import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  llmWorkersConfigSchema,
  type LlmWorker,
  type LlmWorkerProvider,
  type LlmWorkersConfig,
} from "../../../schemas/llm-workers.js";
import {
  getLlmApiConfig,
  isLlmMockEnabled,
  type LlmApiConfig,
  type LlmProvider,
} from "../operator-runtime/llm-api.js";
import { getDataDir, readYamlFile, writeYamlFile } from "../utils.js";

export const LLM_WORKERS_REL = "data/llm/workers.yaml";

export function llmWorkersPath(): string {
  return join(getDataDir(), "llm", "workers.yaml");
}

export function defaultLlmWorkersConfig(): LlmWorkersConfig {
  return llmWorkersConfigSchema.parse({
    schema: "orgos.llm.workers.v1",
    queue: {},
    workers: [],
  });
}

/**
 * When no workers.yaml exists, synthesize a single worker from the legacy
 * env-based `getLlmApiConfig()` so existing deployments keep working.
 */
export function envFallbackWorker(): LlmWorker | null {
  if (isLlmMockEnabled()) {
  return {
    id: "env-mock",
    label: "Mock LLM",
    tier: "local",
    provider: "openai-compatible",
    base_url: "mock://local",
    model: "mock-ceo",
    max_inflight: 4,
    enabled: true,
    api_key_env: "",
    supports_tools: true,
  };
  }
  const cfg = getLlmApiConfig();
  if (!cfg) return null;
  const provider: LlmWorkerProvider =
    cfg.provider === "anthropic" ? "anthropic" : "openai-compatible";
  const tier = /127\.0\.0\.1|localhost|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\./.test(
    cfg.baseUrl,
  )
    ? "local"
    : "cloud";
  return {
    id: "env-default",
    label: tier === "local" ? "Local LLM (env)" : "Cloud LLM (env)",
    tier,
    provider,
    base_url: cfg.baseUrl,
    model: cfg.model,
    max_inflight: 1,
    enabled: true,
    api_key_env:
      provider === "anthropic"
        ? process.env.ANTHROPIC_API_KEY
          ? "ANTHROPIC_API_KEY"
          : process.env.ORGOS_ANTHROPIC_API_KEY
            ? "ORGOS_ANTHROPIC_API_KEY"
            : "ORGOS_LLM_API_KEY"
        : process.env.ORGOS_LLM_API_KEY
          ? "ORGOS_LLM_API_KEY"
          : "OPENAI_API_KEY",
    supports_tools: tier === "cloud",
  };
}

export function loadLlmWorkersConfig(): LlmWorkersConfig {
  const path = llmWorkersPath();
  if (!existsSync(path)) {
    const fallback = envFallbackWorker();
    const base = defaultLlmWorkersConfig();
    if (fallback) {
      return { ...base, workers: [fallback] };
    }
    return base;
  }
  return readYamlFile(path, llmWorkersConfigSchema);
}

export function loadLlmWorkersConfigFile(): LlmWorkersConfig | null {
  const path = llmWorkersPath();
  if (!existsSync(path)) return null;
  return readYamlFile(path, llmWorkersConfigSchema);
}

export function saveLlmWorkersConfig(config: LlmWorkersConfig): string {
  const parsed = llmWorkersConfigSchema.parse(config);
  const ids = new Set<string>();
  for (const w of parsed.workers) {
    if (ids.has(w.id)) {
      throw new Error(`Duplicate worker id: ${w.id}`);
    }
    ids.add(w.id);
  }
  const path = llmWorkersPath();
  mkdirSync(dirname(path), { recursive: true });
  writeYamlFile(path, parsed);
  return path;
}

export function initLlmWorkersConfig(options?: { force?: boolean }): string {
  const path = llmWorkersPath();
  if (existsSync(path) && !options?.force) {
    throw new Error(`LLM workers config already exists: ${path}`);
  }
  const fallback = envFallbackWorker();
  const config = defaultLlmWorkersConfig();
  if (fallback && fallback.id !== "env-mock") {
    config.workers = [
      {
        ...fallback,
        id: fallback.tier === "local" ? "local-01" : "cloud-01",
        label: fallback.tier === "local" ? "Local 01" : "Cloud 01",
      },
    ];
  }
  return saveLlmWorkersConfig(config);
}

export function resolveWorkerApiKey(worker: LlmWorker): string {
  if (worker.api_key_env?.trim()) {
    const fromNamed = process.env[worker.api_key_env.trim()]?.trim();
    if (fromNamed) return fromNamed;
  }
  if (worker.provider === "anthropic") {
    return (
      process.env.ANTHROPIC_API_KEY?.trim() ||
      process.env.ORGOS_ANTHROPIC_API_KEY?.trim() ||
      process.env.ORGOS_LLM_API_KEY?.trim() ||
      ""
    );
  }
  // Local OpenAI-compatible (Ollama / LM Studio) often accepts any non-empty key.
  return (
    process.env.ORGOS_LLM_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    (worker.tier === "local" ? "ollama" : "")
  );
}

export function isWorkerKeyConfigured(worker: LlmWorker): boolean {
  if (worker.base_url.startsWith("mock://")) return true;
  if (worker.tier === "local" && worker.provider === "openai-compatible") {
    return true;
  }
  return resolveWorkerApiKey(worker).length > 0;
}

/**
 * Docker Operator Console sets ORGOS_LLM_API_URL=host.docker.internal while
 * workers.yaml often documents 127.0.0.1 for host-native Ollama.
 */
export function resolveWorkerBaseUrl(worker: LlmWorker): string {
  const base = worker.base_url.replace(/\/$/, "");
  const envOverride = process.env.ORGOS_LLM_API_URL?.trim().replace(/\/$/, "");
  if (
    envOverride &&
    /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(base)
  ) {
    return envOverride;
  }
  return base;
}

export function workerToLlmApiConfig(worker: LlmWorker): LlmApiConfig {
  const provider: LlmProvider =
    worker.provider === "anthropic" ? "anthropic" : "openai-compatible";
  return {
    provider,
    baseUrl: resolveWorkerBaseUrl(worker),
    apiKey: resolveWorkerApiKey(worker) || "missing",
    model: worker.model,
  };
}

export function hasConfiguredLlmWorkers(): boolean {
  if (isLlmMockEnabled()) return true;
  const cfg = loadLlmWorkersConfig();
  return cfg.workers.some((w) => w.enabled && isWorkerKeyConfigured(w));
}

export type LlmWorkersIntegrityIssue = {
  level: "error" | "warning";
  file: string;
  message: string;
};

export function validateLlmWorkersIntegrity(): LlmWorkersIntegrityIssue[] {
  const path = llmWorkersPath();
  if (!existsSync(path)) return [];
  const issues: LlmWorkersIntegrityIssue[] = [];
  let cfg: LlmWorkersConfig;
  try {
    cfg = readYamlFile(path, llmWorkersConfigSchema);
  } catch (err) {
    issues.push({
      level: "error",
      file: LLM_WORKERS_REL,
      message: err instanceof Error ? err.message : String(err),
    });
    return issues;
  }
  const ids = new Set<string>();
  for (const w of cfg.workers) {
    if (ids.has(w.id)) {
      issues.push({
        level: "error",
        file: LLM_WORKERS_REL,
        message: `Duplicate worker id: ${w.id}`,
      });
    }
    ids.add(w.id);
    if (w.enabled && w.tier === "cloud" && !isWorkerKeyConfigured(w)) {
      issues.push({
        level: "warning",
        file: LLM_WORKERS_REL,
        message: `Cloud worker ${w.id} has no API key in env${w.api_key_env ? ` (${w.api_key_env})` : ""}`,
      });
    }
  }
  return issues;
}

export type { LlmWorkersConfig, LlmWorker };
