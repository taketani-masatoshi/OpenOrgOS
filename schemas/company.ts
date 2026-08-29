import { z } from "zod";
import { dateString } from "./common.js";

export const directorSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
});

export const shareCapitalSchema = z.object({
  amount_yen: z.number().nonnegative().optional(),
  issued_shares: z.number().int().nonnegative().optional(),
  par_value_yen: z.number().nonnegative().optional(),
  sole_shareholder: z.string().optional(),
  demo_confirmed_at: dateString.optional(),
});

export const companyPublicDisclosureSchema = z.object({
  website: z.string().optional(),
  about_url: z.string().optional(),
  representative_email: z.string().optional(),
  contact_email: z.string().optional(),
  capital_yen: z.number().nonnegative().optional(),
  capital_as_of: z.string().optional(),
  employees: z.number().int().nonnegative().optional(),
  source: z.string().optional(),
  note: z.string().optional(),
});

/** 登記完了前の意図的ギャップ（辞任・移転等） */
export const companyGovernanceStatusSchema = z.object({
  director_resignation: z
    .object({
      person: z.string().optional(),
      notice_sent: dateString.optional(),
      effective_date: dateString.optional(),
      registration_planned: z.string().optional(),
      status: z.string().optional(),
      note: z.string().optional(),
    })
    .optional(),
}).passthrough();

/** Console 組織ページに出す社外専門家の種別。 */
export const companyAdvisorKindSchema = z.enum(["legal", "tax", "technical"]);

export const companyAdvisorStatusSchema = z.enum(["engaged", "none"]);

export const companyAdvisorSchema = z
  .object({
    kind: companyAdvisorKindSchema,
    status: companyAdvisorStatusSchema.default("none"),
    name: z.string().min(1).optional(),
    firm: z.string().min(1).optional(),
    note: z.string().optional(),
    /** `external-contacts.yaml` の id。Console には出さない。 */
    contact_id: z.string().regex(/^EXT-\d{3,}$/).optional(),
    contract_id: z.string().min(1).optional(),
  })
  .superRefine((row, ctx) => {
    if (row.status === "engaged" && !row.name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "engaged advisor requires name",
        path: ["name"],
      });
    }
  });

export const companyAdvisorsListSchema = z.array(companyAdvisorSchema).superRefine((rows, ctx) => {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (seen.has(row.kind)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate advisor kind: ${row.kind}`,
        path: [index, "kind"],
      });
    }
    seen.add(row.kind);
  });
});

export const companySchema = z.object({
  name: z.string().min(1),
  corporate_number: z.string().optional(),
  established_date: dateString.optional(),
  representative: z.string().optional(),
  directors: z.array(directorSchema).optional(),
  address: z.string().optional(),
  business_description: z.string().optional(),
  fiscal_year_end_month: z.number().int().min(1).max(12).optional(),
  /** One-line aliases. Console 正本は `advisors`。 */
  tax_advisor: z.string().optional(),
  technical_advisor: z.string().optional(),
  judicial_scrivener: z.string().optional(),
  administrative_scrivener: z.string().optional(),
  legal_advisor: z.string().optional(),
  advisors: companyAdvisorsListSchema.optional(),
  /** 資本金等（許可申請の自動記入用 · L1） */
  share_capital: shareCapitalSchema.optional(),
  public_disclosure: companyPublicDisclosureSchema.optional(),
  governance_status: companyGovernanceStatusSchema.optional(),
});

export type Director = z.output<typeof directorSchema>;
export type CompanyAdvisor = z.output<typeof companyAdvisorSchema>;
export type CompanyAdvisorKind = z.output<typeof companyAdvisorKindSchema>;
export type Company = z.output<typeof companySchema>;
