import { z } from "zod";

export const llmWorkerTierSchema = z.enum(["local", "cloud"]);
export const llmWorkerProviderSchema = z.enum(["openai-compatible", "anthropic"]);

export const llmWorkerSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, "worker id must be alphanumeric"),
  label: z.string().min(1),
  tier: llmWorkerTierSchema,
  provider: llmWorkerProviderSchema,
  base_url: z.string().min(1).refine(
    (v) => /^https?:\/\//i.test(v) || v.startsWith("mock://"),
    "base_url must be http(s) or mock://",
  ),
  model: z.string().min(1),
  max_inflight: z.number().int().min(1).max(32).default(1),
  enabled: z.boolean().default(true),
  /** Env var name that holds the API key. Never store the key itself. */
  api_key_env: z.string().default(""),
  /** Whether this worker reliably supports OpenAI-style tool calling. */
  supports_tools: z.boolean().default(false),
});

export const llmCloudOverflowSchema = z.object({
  enabled: z.boolean().default(false),
  wait_threshold_ms: z.number().int().min(0).max(600_000).default(8_000),
  max_inflight: z.number().int().min(1).max(32).default(2),
});

export const llmQueueConfigSchema = z.object({
  max_queue: z.number().int().min(1).max(10_000).default(64),
  queue_timeout_ms: z.number().int().min(1_000).max(3_600_000).default(120_000),
  cloud_overflow: llmCloudOverflowSchema.default({}),
});

export const llmWorkersConfigSchema = z.object({
  schema: z.literal("orgos.llm.workers.v1"),
  queue: llmQueueConfigSchema.default({}),
  workers: z.array(llmWorkerSchema).default([]),
});

export type LlmWorkerTier = z.output<typeof llmWorkerTierSchema>;
export type LlmWorkerProvider = z.output<typeof llmWorkerProviderSchema>;
export type LlmWorker = z.output<typeof llmWorkerSchema>;
export type LlmCloudOverflow = z.output<typeof llmCloudOverflowSchema>;
export type LlmQueueConfig = z.output<typeof llmQueueConfigSchema>;
export type LlmWorkersConfig = z.output<typeof llmWorkersConfigSchema>;

export const llmWorkersConfigUpdateSchema = llmWorkersConfigSchema;

/** Chat / ask routing hint. Auto keeps local-first + optional cloud overflow. */
export const llmRouteHintSchema = z
  .object({
    mode: z.enum(["auto", "local", "cloud"]),
    worker_id: z.string().min(1).max(80).optional(),
    /** Optional installed model override for a pinned local worker. */
    model: z.string().min(1).max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.model && (value.mode !== "local" || !value.worker_id)) {
      ctx.addIssue({
        code: "custom",
        path: ["model"],
        message: "model override requires a pinned local worker",
      });
    }
  });

export type LlmRouteHint = z.output<typeof llmRouteHintSchema>;
