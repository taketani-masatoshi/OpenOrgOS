import { z } from "zod";

export const cloudAgentConfigSchema = z.object({
  version: z.string().default("1"),
  runtime: z.enum(["local", "cloud", "auto"]).default("auto"),
  cloud: z
    .object({
      repository: z.string().optional(),
      ref: z.string().default("main"),
      model: z.string().default("composer-2.5"),
    })
    .optional(),
  watch: z
    .object({
      enabled: z.boolean().default(true),
      interval_ms: z.number().int().default(30_000),
    })
    .optional(),
});

export type CloudAgentConfig = z.output<typeof cloudAgentConfigSchema>;

export const prManifestSchema = z.object({
  id: z.string(),
  work_order_id: z.string(),
  branch: z.string(),
  title: z.string(),
  body_path: z.string(),
  base: z.string().default("main"),
  created_at: z.string(),
  status: z.enum(["planned", "created", "failed"]).default("planned"),
  pr_url: z.string().optional(),
  error: z.string().optional(),
});

export type PrManifest = z.output<typeof prManifestSchema>;
