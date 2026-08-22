import { z } from "zod";
import { orgApprovalTierSchema } from "./tier.js";

/** WebAuthn credential role — ADR 0037. */
export const webauthnCredentialPurposeSchema = z.enum(["login", "settlement"]);

export type WebAuthnCredentialPurpose = z.output<typeof webauthnCredentialPurposeSchema>;

/** Default public settlement RP / approve site host. */
export const DEFAULT_SETTLEMENT_RP_ID = "approve.oorgos.org";

export const settlementChallengeStatusSchema = z.enum([
  "pending",
  "completed",
  "expired",
  "consumed",
]);

export const settlementChallengeSummarySchema = z.object({
  approval_id: z.string().min(1),
  subject_type: z.string().min(1),
  subject_ref: z.string().optional(),
  message: z.string().optional(),
  amount: z
    .object({
      value: z.number().nonnegative(),
      currency: z.string().min(1),
    })
    .optional(),
  tier: orgApprovalTierSchema.optional(),
  policy_ref: z.string().optional(),
});

export const settlementChallengeRecordSchema = z.object({
  challenge_id: z.string().min(1),
  token: z.string().min(1),
  webauthn_challenge: z.string().min(1),
  approval_id: z.string().min(1),
  operator_id: z.string().min(1),
  approver_id: z.string().min(1),
  co_approver_id: z.string().optional(),
  api_origin: z.string().url(),
  rp_id: z.string().min(1),
  status: settlementChallengeStatusSchema,
  summary: settlementChallengeSummarySchema,
  created_at: z.string().min(1),
  expires_at: z.string().min(1),
  completed_at: z.string().optional(),
  settlement_credential_id: z.string().optional(),
});

export const settlementQrFragmentSchema = z.object({
  v: z.literal(1),
  challenge_id: z.string().min(1),
  token: z.string().min(1),
  api_origin: z.string().url(),
  approve_origin: z.string().url(),
});

export const settlementWebAuthnAssertionSchema = z.object({
  credential_id: z.string().min(1),
  challenge: z.string().min(1),
  client_data_json: z.string().min(1),
  authenticator_data_base64: z.string().min(1).optional(),
  signature_base64: z.string().min(1).optional(),
});

export type SettlementChallengeSummary = z.output<typeof settlementChallengeSummarySchema>;
export type SettlementChallengeRecord = z.output<typeof settlementChallengeRecordSchema>;
export type SettlementQrFragment = z.output<typeof settlementQrFragmentSchema>;
export type SettlementWebAuthnAssertion = z.output<typeof settlementWebAuthnAssertionSchema>;
