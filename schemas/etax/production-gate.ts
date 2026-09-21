import { z } from "zod";

/**
 * Production submit is fail-closed. An environment variable alone cannot enable it.
 */
export const etaxProductionGateSchema = z.object({
  schema_version: z.literal(1),
  production_submission_enabled: z.boolean(),
  requirements: z.object({
    ksk2_spec_registered: z.boolean(),
    xml_schema_validation_proven: z.boolean(),
    integration_tests_passed: z.boolean(),
    nta_transmission_test_completed: z.boolean(),
    production_credentials_configured: z.boolean(),
    orgos_human_approval_recorded: z.boolean(),
    production_feature_gate_released: z.boolean(),
  }),
  nta_transmission_test: z.object({
    completed: z.boolean(),
    evidence_path: z.string().nullable(),
    completed_at: z.string().nullable(),
  }),
});

export type EtaxProductionGate = z.output<typeof etaxProductionGateSchema>;
