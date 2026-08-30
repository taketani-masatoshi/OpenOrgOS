import { z } from "zod";

export const isoStandardEntrySchema = z.object({
  id: z.string().regex(/^ISO-\d{4,5}$/),
  enabled: z.boolean(),
  /** Default applicable. excluded requires exclusion_reason (no fake records). */
  applicability: z.enum(["applicable", "excluded"]).default("applicable"),
  exclusion_reason: z.string().min(1).optional(),
  notes: z.string().optional(),
}).superRefine((entry, ctx) => {
  if (entry.applicability === "excluded" && !entry.exclusion_reason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "excluded には exclusion_reason が必要です",
      path: ["exclusion_reason"],
    });
  }
});

export const tenantStandardsFileSchema = z.object({
  iso: z.array(isoStandardEntrySchema).default([]),
});

export type IsoStandardEntry = z.output<typeof isoStandardEntrySchema>;
export type TenantStandardsFile = z.output<typeof tenantStandardsFileSchema>;
