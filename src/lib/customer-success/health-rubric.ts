/**
 * Customer health rubric loader — SSOT from steward/modules/customer_success/health-rubric.yaml
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { STEWARD_MODULES_DIR } from "../steward-paths.js";
import { readYamlFile } from "../utils.js";

const penaltyBlockSchema = z.object({
  max: z.number().nonnegative(),
});

const contactRecencyPenaltySchema = penaltyBlockSchema.extend({
  days_healthy: z.number().int().nonnegative(),
  days_at_risk: z.number().int().nonnegative(),
  days_critical: z.number().int().nonnegative(),
});

const actionOverduePenaltySchema = penaltyBlockSchema.extend({
  days_grace: z.number().int().nonnegative(),
});

const renewalProximityPenaltySchema = penaltyBlockSchema.extend({
  days_healthy: z.number().int().nonnegative(),
  days_at_risk: z.number().int().nonnegative(),
  days_critical: z.number().int().nonnegative(),
});

const usageIndexPenaltySchema = penaltyBlockSchema.extend({
  healthy_min: z.number().min(0).max(100),
  at_risk_min: z.number().min(0).max(100),
});

const supportPressurePenaltySchema = penaltyBlockSchema.extend({
  tickets_healthy_max: z.number().int().nonnegative(),
  tickets_at_risk_max: z.number().int().nonnegative(),
  escalations_penalty: z.number().nonnegative(),
});

const npsLatestPenaltySchema = penaltyBlockSchema.extend({
  promoter_min: z.number().int().min(0).max(10),
  passive_min: z.number().int().min(0).max(10),
  detractor_max: z.number().int().min(0).max(10),
});

const onboardingDelayPenaltySchema = penaltyBlockSchema.extend({
  milestone_overdue_days: z.number().int().nonnegative(),
});

export const healthRubricSchema = z.object({
  version: z.literal(1),
  thresholds: z.object({
    healthy_min: z.number().min(0).max(100),
    at_risk_min: z.number().min(0).max(100),
    critical_min: z.number().min(0).max(100),
  }),
  penalties: z.object({
    contact_recency: contactRecencyPenaltySchema,
    action_overdue: actionOverduePenaltySchema,
    renewal_proximity: renewalProximityPenaltySchema,
    usage_index: usageIndexPenaltySchema,
    support_pressure: supportPressurePenaltySchema,
    nps_latest: npsLatestPenaltySchema,
    onboarding_delay: onboardingDelayPenaltySchema,
  }),
});

export type HealthRubric = z.output<typeof healthRubricSchema>;

const RUBRIC_PATH = join(
  STEWARD_MODULES_DIR,
  "customer_success",
  "health-rubric.yaml",
);

let cachedRubric: HealthRubric | null = null;

export function loadHealthRubric(): HealthRubric {
  if (cachedRubric) return cachedRubric;
  if (!existsSync(RUBRIC_PATH)) {
    throw new Error(`Health rubric not found: ${RUBRIC_PATH}`);
  }
  cachedRubric = readYamlFile(RUBRIC_PATH, healthRubricSchema);
  return cachedRubric;
}

export function clearHealthRubricCache(): void {
  cachedRubric = null;
}
