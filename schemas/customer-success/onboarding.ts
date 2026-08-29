import { z } from "zod";
import { dateString } from "../common.js";

export const onboardingMilestoneStatusSchema = z.enum([
  "pending",
  "in_progress",
  "done",
  "blocked",
]);

export const onboardingMilestoneSchema = z.object({
  key: z.string().min(1),
  due: dateString,
  done_on: dateString.optional(),
  status: onboardingMilestoneStatusSchema,
});

export const customerOnboardingSchema = z.object({
  id: z.string().regex(/^CSON-\d{4}-\d{3}$/),
  account_id: z.string().regex(/^CUST-\d{4}-\d{3}$/),
  started_on: dateString,
  target_go_live: dateString,
  milestones: z.array(onboardingMilestoneSchema).default([]),
});

export type CustomerOnboarding = z.output<typeof customerOnboardingSchema>;

export const customerOnboardingFileSchema = z.object({
  version: z.literal(1),
  updated_at: z.string().min(1).optional(),
  onboardings: z.array(customerOnboardingSchema),
});

export type CustomerOnboardingFile = z.output<typeof customerOnboardingFileSchema>;
