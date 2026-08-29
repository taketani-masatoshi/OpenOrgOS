import { z } from "zod";

export const iso37000PrincipleIdSchema = z.enum([
  "P-01",
  "P-02",
  "P-03",
  "P-04",
  "P-05",
  "P-06",
  "P-07",
  "P-08",
  "P-09",
  "P-10",
  "P-11",
]);

export const iso37000SelfDeclarationSchema = z.object({
  schema_version: z.literal(1),
  standard: z.literal("ISO-37000"),
  /** draft → ready（status 点検充足）→ self_declared（人間署名） */
  status: z.enum(["draft", "ready", "self_declared"]).default("draft"),
  company_name: z.string().min(1).optional(),
  signatory_role: z.string().min(1).default("代表取締役"),
  signatory_name: z.string().optional(),
  signed_at: z.string().datetime().nullable().optional(),
  review_cycle: z.enum(["annual", "biennial"]).default("annual"),
  next_review: z.string().optional().nullable(),
  framework_paths: z
    .object({
      principles_rule: z.string().default("steward/rules/governance-principles.md"),
      control_map: z.string().default("steward/standards/iso/ISO-37000/control-map.yaml"),
      declaration_md: z.string().default("docs/compliance/iso/ISO-37000/self-declaration.md"),
    })
    .default({}),
  notes: z.string().optional(),
  last_assessment: z
    .object({
      assessed_at: z.string().datetime(),
      principles_ok: z.number().int().nonnegative(),
      principles_total: z.number().int().positive(),
      ready_for_self_declaration: z.boolean(),
    })
    .optional(),
});

export type Iso37000SelfDeclaration = z.output<typeof iso37000SelfDeclarationSchema>;
export type Iso37000PrincipleId = z.output<typeof iso37000PrincipleIdSchema>;
