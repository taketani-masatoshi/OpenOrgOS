import { z } from "zod";

export const mailInterpretIntentSchema = z.enum([
  "schedule",
  "return_item",
  "invoice",
  "inquiry",
  "test",
  "spam",
  "unknown",
]);

export const partyRoleSchema = z.enum(["sender", "recipient", "none", "unclear"]);

export const mailInterpretVoteSchema = z.object({
  model: z.string(),
  intent: mailInterpretIntentSchema,
  who_lent: partyRoleSchema.optional(),
  who_must_return: partyRoleSchema.optional(),
  action_required: z.boolean(),
  summary_l1: z.string().max(500),
  confidence: z.number().min(0).max(1).default(0.5),
});

export const mailInterpretationResultSchema = z.object({
  mail_id: z.string(),
  interpreted_at: z.string(),
  intent: mailInterpretIntentSchema,
  who_lent: partyRoleSchema.optional(),
  who_must_return: partyRoleSchema.optional(),
  action_required: z.boolean(),
  summary_l1: z.string(),
  agreement: z.number().min(0).max(1),
  dissent_notes: z.array(z.string()).default([]),
  votes: z.array(mailInterpretVoteSchema).default([]),
  needs_ceo_confirm: z.boolean().default(false),
  ceo_questions: z.array(z.string()).default([]),
});

export type MailInterpretVote = z.output<typeof mailInterpretVoteSchema>;
export type MailInterpretationResult = z.output<typeof mailInterpretationResultSchema>;
