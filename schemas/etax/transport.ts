import { z } from "zod";

export const etaxTransportProviderIdSchema = z.enum(["mock", "official"]);
export type EtaxTransportProviderId = z.output<typeof etaxTransportProviderIdSchema>;

export const etaxTransportCatalogSchema = z.object({
  schema_version: z.literal(1),
  specFamily: z.literal("ksk2"),
  specArtifactId: z.literal("e-tax04"),
  notes: z.string(),
  windows: z.object({
    dll: z.string(),
    progid: z.string(),
    clsid: z.string(),
    typelib: z.string().optional(),
    source: z.string(),
    submitMethod: z.string(),
    receiptMethod: z.string(),
    methods: z.array(z.string().min(1)),
  }),
  /** Tip stays false until operator confirms Windows host health. */
  hostBound: z.boolean(),
});

export type EtaxTransportCatalog = z.output<typeof etaxTransportCatalogSchema>;
