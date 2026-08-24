import { z } from "zod";

/**
 * AIA parallel runtime config (ADR 0040).
 * Tenant path: data/org/aia-runtime.yaml
 * Spec: docs/org-os/aia-parallel-runtime.md
 */

export const aiaRuntimeTierSchema = z.enum(["soft", "target", "hard"]);

export const aiaRuntimeMetricsSchema = z
  .object({
    aia_running: z.number().int().nonnegative().optional(),
    aia_queued: z.number().int().nonnegative().optional(),
    aia_llm_wait: z.number().nonnegative().optional(),
    aia_cas_conflict: z.number().int().nonnegative().optional(),
    aia_module_job_reject: z.number().int().nonnegative().optional(),
  })
  .default({});

export const aiaRuntimeFileSchema = z
  .object({
    schema: z.literal("orgos.aia.runtime.v1"),
    version: z.literal(1).default(1),
    tier: aiaRuntimeTierSchema.default("soft"),
    /** Soft 10 · target 20 · hard 30. Must not exceed 30. */
    max_concurrent_aia: z.number().int().min(1).max(30).default(10),
    llm_backpressure: z.boolean().default(true),
    queue_timeout_seconds: z.number().int().positive().default(3600),
    metrics: aiaRuntimeMetricsSchema.optional(),
  })
  .superRefine((file, ctx) => {
    const expected =
      file.tier === "soft" ? 10 : file.tier === "target" ? 20 : 30;
    if (file.max_concurrent_aia > expected && file.tier !== "hard") {
      // Allow explicit lower caps; warn only when over tier label without hard
      if (file.max_concurrent_aia > 30) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "max_concurrent_aia must be ≤ 30 (hard ceiling)",
          path: ["max_concurrent_aia"],
        });
      }
    }
    if (file.tier === "hard" && file.max_concurrent_aia > 30) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "hard tier cannot exceed 30",
        path: ["max_concurrent_aia"],
      });
    }
  });

export const aiaRunStateSchema = z.enum([
  "queued",
  "admitted",
  "running",
  "merging",
  "done",
  "failed",
]);

export const aiaRunRecordSchema = z.object({
  run_id: z.string().min(1),
  agent_id: z.string().min(1),
  module_id: z.string().min(1).optional(),
  work_order_id: z.string().min(1).optional(),
  state: aiaRunStateSchema,
  workspace_relpath: z.string().min(1),
  queued_at: z.string().datetime(),
  admitted_at: z.string().datetime().optional(),
  started_at: z.string().datetime().optional(),
  finished_at: z.string().datetime().optional(),
  fail_reason: z.string().optional(),
});

export type AiaRuntimeFile = z.output<typeof aiaRuntimeFileSchema>;
export type AiaRunState = z.output<typeof aiaRunStateSchema>;
export type AiaRunRecord = z.output<typeof aiaRunRecordSchema>;
