import { z } from "zod";

/**
 * Data-driven field map extracted from official KSK2 帳票フィールド仕様.
 * Hand-invented element names are forbidden. Empty catalog = SPEC_BLOCKED.
 */
export const etaxFieldMapEntrySchema = z.object({
  sourcePath: z.string().min(1),
  xmlLocalName: z.string().min(1),
  required: z.boolean(),
});

export const etaxProcedureMappingSchema = z.object({
  schema_version: z.literal(1),
  specFamily: z.literal("ksk2"),
  procedureCode: z.string().min(1),
  formId: z.string().min(1),
  schemaRelativePath: z.string().min(1),
  specArtifactId: z.string().min(1),
  fields: z.array(etaxFieldMapEntrySchema),
  notes: z.string(),
});

export type EtaxFieldMapEntry = z.output<typeof etaxFieldMapEntrySchema>;
export type EtaxProcedureMapping = z.output<typeof etaxProcedureMappingSchema>;
