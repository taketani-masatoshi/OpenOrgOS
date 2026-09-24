import { z } from "zod";

export const scopeFileSchema = z.object({
  version: z.string().optional(),
  areas: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        in_scope: z.boolean().default(true),
        cross_ref: z.string().optional(),
      })
    )
    .default([]),
});

export const processFileSchema = z.object({
  version: z.string().optional(),
  processes: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        module: z.string().min(1),
        records: z.string().optional(),
      })
    )
    .default([]),
});

export const itgcFileSchema = z.object({
  version: z.string().optional(),
  checks: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        ref: z.string().optional(),
      })
    )
    .default([]),
});

export type JsoxScopeFile = z.output<typeof scopeFileSchema>;
export type JsoxProcessFile = z.output<typeof processFileSchema>;
export type JsoxItgcFile = z.output<typeof itgcFileSchema>;
