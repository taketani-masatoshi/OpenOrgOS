import { z } from "zod";

/**
 * Submission lifecycle. Names must not imply tax-authority legal correctness.
 * RECEIVED_BY_ETAX != TAX_RETURN_APPROVED.
 */
export const etaxSubmissionStatusSchema = z.enum([
  "DRAFT",
  "GENERATED",
  "SCHEMA_VALID",
  "BUSINESS_RULE_VALID",
  "APPROVED",
  "SIGNED",
  "READY_TO_SUBMIT",
  "SUBMITTED",
  "RECEIVED_BY_ETAX",
  "REJECTED_BY_ETAX",
  "TRANSPORT_ERROR",
]);

export type EtaxSubmissionStatus = z.output<typeof etaxSubmissionStatusSchema>;

export const etaxEnvironmentSchema = z.enum(["mock", "test", "production"]);
export type EtaxEnvironment = z.output<typeof etaxEnvironmentSchema>;

export const etaxProcedureSupportSchema = z.enum([
  "SUPPORTED",
  "EXPERIMENTAL",
  "UNSUPPORTED",
]);
export type EtaxProcedureSupport = z.output<typeof etaxProcedureSupportSchema>;
