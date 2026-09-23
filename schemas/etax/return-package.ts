import { z } from "zod";

export const etaxSourceReferenceSchema = z.object({
  kind: z.enum([
    "tax_handoff_package",
    "corporate_tax_xml_draft",
    "consumption_assessment",
    "tenant_yaml",
    "advisor_pack",
    "other",
  ]),
  path: z.string().min(1),
  content_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
});

export type EtaxSourceReference = z.output<typeof etaxSourceReferenceSchema>;

/**
 * Canonical input to the e-Tax integration module.
 * Does not contain computed tax; upstream tax modules own calculation.
 */
export const returnPackageSchema = z.object({
  id: z.string().regex(/^ETAX-PKG-[A-Za-z0-9_-]+$/),
  taxpayerId: z.string().min(1),
  procedureCode: z.string().min(1),
  taxYear: z.string().min(1),
  revision: z.number().int().nonnegative(),
  payload: z.unknown(),
  createdAt: z.string().min(1),
  createdBy: z.string().min(1),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  sourceReferences: z.array(etaxSourceReferenceSchema).default([]),
  specFamily: z.literal("ksk2"),
  specVersion: z.string().min(1),
});

export type ReturnPackage = z.output<typeof returnPackageSchema>;

export const returnPackageCreateInputSchema = z.object({
  taxpayerId: z.string().min(1),
  procedureCode: z.string().min(1),
  taxYear: z.string().min(1),
  revision: z.number().int().nonnegative().default(0),
  payload: z.unknown(),
  createdBy: z.string().min(1),
  sourceReferences: z.array(etaxSourceReferenceSchema).default([]),
  specVersion: z.string().min(1).optional(),
});

export type ReturnPackageCreateInput = z.input<typeof returnPackageCreateInputSchema>;
