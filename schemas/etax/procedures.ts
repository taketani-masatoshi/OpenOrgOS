import { z } from "zod";
import { etaxProcedureSupportSchema } from "./submission-state.js";

export const etaxSupportedProcedureSchema = z.object({
  procedureCode: z.string().min(1),
  title: z.string().min(1),
  taxYearFrom: z.string().optional(),
  taxYearTo: z.string().optional(),
  schemaVersion: z.string().optional(),
  specVersion: z.string().optional(),
  support: etaxProcedureSupportSchema,
  productionEligible: z.boolean(),
  notes: z.string().optional(),
});

export const etaxProcedureMatrixSchema = z.object({
  schema_version: z.literal(1),
  specFamily: z.literal("ksk2"),
  defaultSupport: etaxProcedureSupportSchema,
  procedures: z.array(etaxSupportedProcedureSchema),
  notes: z.string(),
});

export type EtaxSupportedProcedure = z.output<typeof etaxSupportedProcedureSchema>;
export type EtaxProcedureMatrix = z.output<typeof etaxProcedureMatrixSchema>;
