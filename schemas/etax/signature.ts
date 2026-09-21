import { z } from "zod";

export const etaxSignatureProviderIdSchema = z.enum(["mock", "official"]);

export const etaxSignatureResultSchema = z.object({
  provider: etaxSignatureProviderIdSchema,
  legal: z.boolean(),
  certificateId: z.string().min(1),
  certificateValid: z.boolean(),
  signingTime: z.string().min(1),
  documentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  signatureHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  moduleId: z.string().optional(),
  method: z.string().optional(),
  notLegalReason: z.string().optional(),
});

export type EtaxSignatureProviderId = z.output<typeof etaxSignatureProviderIdSchema>;
export type EtaxSignatureResult = z.output<typeof etaxSignatureResultSchema>;

export const etaxSignatureCatalogSchema = z.object({
  schema_version: z.literal(1),
  specFamily: z.literal("ksk2"),
  specArtifactId: z.literal("e-tax05"),
  notes: z.string(),
  windows: z.object({
    dll: z.string(),
    progid: z.string(),
    clsid: z.string(),
    typelib: z.string().optional(),
    namespace: z.string(),
    source: z.string(),
    reportMethod: z.string(),
    methods: z.array(z.string().min(1)),
  }),
  cocoa: z.object({
    framework: z.string(),
    interface: z.string(),
    source: z.string(),
    reportMethod: z.string(),
    methods: z.array(z.string().min(1)),
  }),
  /** Tip stays false until operator confirms Windows host health. */
  hostBound: z.boolean(),
});

export type EtaxSignatureCatalog = z.output<typeof etaxSignatureCatalogSchema>;
