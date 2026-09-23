import { z } from "zod";

export const etaxValidationLayerStatusSchema = z.enum(["pass", "fail", "SPEC_BLOCKED", "skipped"]);

export const etaxValidationLayerResultSchema = z.object({
  layer: z.enum(["structural", "specification", "orgos"]),
  status: etaxValidationLayerStatusSchema,
  detail: z.string(),
});

export const etaxValidationReportSchema = z.object({
  ok: z.boolean(),
  layers: z.array(etaxValidationLayerResultSchema),
  xmlHash: z.string().optional(),
  schemaPath: z.string().optional(),
});

export type EtaxValidationLayerStatus = z.output<typeof etaxValidationLayerStatusSchema>;
export type EtaxValidationLayerResult = z.output<typeof etaxValidationLayerResultSchema>;
export type EtaxValidationReport = z.output<typeof etaxValidationReportSchema>;
