import { z } from "zod";

const ruleListSchema = z
  .object({
    from_addresses: z.array(z.string()).optional(),
    from_domains: z.array(z.string()).optional(),
    subject_keywords: z.array(z.string()).optional(),
    subject_patterns: z.array(z.string()).optional(),
  })
  .optional();

export const mailTriageRulesSchema = z.object({
  version: z.literal(1).default(1),
  spam: ruleListSchema,
  suspicious: ruleListSchema,
  importance: z
    .object({
      p0: ruleListSchema,
      p1: ruleListSchema,
      p2: ruleListSchema,
      p3: ruleListSchema,
    })
    .optional(),
  urgency: z
    .object({
      immediate: ruleListSchema,
      today: ruleListSchema,
      week: ruleListSchema,
    })
    .optional(),
  routing: z
    .object({
      spam: z.enum(["ignore", "archive", "secretary"]).default("ignore"),
      suspicious: z.enum(["ignore", "archive", "secretary"]).default("archive"),
      p0_ham: z.enum(["ignore", "archive", "secretary"]).default("secretary"),
      default_ham: z.enum(["ignore", "archive", "secretary"]).default("secretary"),
    })
    .optional(),
});

export type MailTriageRules = z.output<typeof mailTriageRulesSchema>;
export type MailTriageRuleSet = NonNullable<MailTriageRules["spam"]>;
