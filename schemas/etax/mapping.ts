import { z } from "zod";

/**
 * Data-driven field map extracted from official KSK2 帳票フィールド仕様 / XSD.
 * Hand-invented element names are forbidden. Empty catalog = SPEC_BLOCKED.
 */
export const etaxFieldMapEntrySchema = z.object({
  sourcePath: z.string().min(1),
  xmlLocalName: z.string().min(1),
  /** Dot path under the IT / form tree, e.g. "ZEIMUSHO.zeimusho_CD" or "TETSUZUKI.procedure_CD" */
  xmlPath: z.string().min(1).optional(),
  required: z.boolean(),
});

export const etaxEnvelopeSchema = z.object({
  rootElement: z.literal("DATA"),
  targetNamespace: z.string().url(),
  generalNamespace: z.string().url(),
  rdfNamespace: z.string().url(),
  procedureElement: z.string().min(1),
  procedureVersion: z.string().min(1),
  itVersion: z.string().min(1),
  requiredForms: z
    .array(
      z.object({
        element: z.string().min(1),
        version: z.string().min(1),
      }),
    )
    .min(1),
  softNM: z.string().min(1),
  sakuseiNM: z.string().min(1),
  /** Payload path for sakuseiDay (YYYY-MM-DD); defaults to today if absent */
  sakuseiDaySource: z.string().optional(),
});

export const etaxProcedureMappingSchema = z.object({
  schema_version: z.literal(1),
  specFamily: z.literal("ksk2"),
  procedureCode: z.string().min(1),
  formId: z.string().min(1),
  schemaRelativePath: z.string().min(1),
  /** Field-map source CAB (e-tax10) or XSD CAB (e-tax19) when envelope is XSD-derived */
  specArtifactId: z.string().min(1),
  envelope: etaxEnvelopeSchema.optional(),
  fields: z.array(etaxFieldMapEntrySchema),
  notes: z.string(),
});

export type EtaxFieldMapEntry = z.output<typeof etaxFieldMapEntrySchema>;
export type EtaxEnvelope = z.output<typeof etaxEnvelopeSchema>;
export type EtaxProcedureMapping = z.output<typeof etaxProcedureMappingSchema>;
