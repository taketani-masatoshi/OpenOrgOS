/**
 * Settlement PassKey step-up (ADR 0037) — tier B/C high-value approvals.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { OrgApprovalRequest } from "../../../schemas/org/approval.js";
import type { OrgApprovalTier } from "../../../schemas/org/tier.js";
import {
  settlementChallengeRecordSchema,
  settlementQrFragmentSchema,
  settlementWebAuthnAssertionSchema,
  type SettlementChallengeRecord,
  type SettlementQrFragment,
  type SettlementWebAuthnAssertion,
} from "../../../schemas/org/settlement-stepup.js";
import { resolveWireGovernanceTier } from "../jurisdiction/wire-governance/evaluate.js";
import { getWorkspaceRoot } from "../orgos-paths.js";
import {
  credentialPurpose,
  findWebAuthnCredential,
  listWebAuthnCredentialsByPurpose,
  updateWebAuthnSignCount,
} from "../wire-console/auth/webauthn-store.js";
import { isWebAuthnTestSecretAllowed } from "../wire-console/auth/webauthn-verify.js";
import { verifyWebAuthnAssertion } from "../wire-console/auth/webauthn-assertion.js";
import { settlementRpId, rpId } from "../wire-console/auth/webauthn-shared.js";
import { webauthnOriginsEqual } from "../wire-console/auth/webauthn-origin.js";

const DEFAULT_TTL_MS = 5 * 60_000;

export class SettlementStepUpRequiredError extends Error {
  readonly code = "step_up_required";
  readonly approvalId: string;
  readonly tier: OrgApprovalTier;

  constructor(approvalId: string, tier: OrgApprovalTier) {
    super(
      `Approval ${approvalId} requires settlement PassKey step-up (tier ${tier}). ` +
        `Create a challenge via POST /chat/v1/settlement/challenge and complete with hybrid PassKey on the console origin.`
    );
    this.name = "SettlementStepUpRequiredError";
    this.approvalId = approvalId;
    this.tier = tier;
  }
}

export function isSettlementStepUpEnabled(): boolean {
  return process.env.ORGOS_SETTLEMENT_STEPUP !== "0";
}

export { settlementRpId };

export function settlementApproveOrigin(): string {
  /** Deprecated help host only — ceremony runs on the console origin (Phase 2+). */
  return (
    process.env.ORGOS_SETTLEMENT_APPROVE_ORIGIN?.trim() ||
    `https://${settlementRpId()}`
  );
}

/** Console WebAuthn origin for settlement create/get (same as login). */
export function settlementCeremonyOrigin(): string {
  return (process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN ?? "").replace(/\/$/, "");
}

export function settlementChallengeStorePath(): string {
  const fromEnv = process.env.ORGOS_SETTLEMENT_CHALLENGE_STORE?.trim();
  if (fromEnv) return fromEnv;
  return join(getWorkspaceRoot(), ".orgos", "settlement-challenges.json");
}

type ChallengeFile = { version: 1; challenges: Record<string, SettlementChallengeRecord> };

function hmacSecret(): Buffer {
  const raw =
    process.env.ORGOS_SETTLEMENT_CHALLENGE_SECRET?.trim() ||
    process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET?.trim() ||
    "orgos-dev-settlement-challenge";
  return Buffer.from(raw, "utf-8");
}

function signToken(challengeId: string, approvalId: string, operatorId: string): string {
  return createHmac("sha256", hmacSecret())
    .update(`${challengeId}\0${approvalId}\0${operatorId}`)
    .digest("base64url");
}

function verifyToken(
  token: string,
  challengeId: string,
  approvalId: string,
  operatorId: string
): boolean {
  const expected = Buffer.from(signToken(challengeId, approvalId, operatorId), "utf-8");
  const got = Buffer.from(token, "utf-8");
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

function readChallengeFile(): ChallengeFile {
  const path = settlementChallengeStorePath();
  if (!existsSync(path)) return { version: 1, challenges: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as ChallengeFile;
    if (parsed.version === 1 && parsed.challenges) return parsed;
  } catch {
    /* rebuild */
  }
  return { version: 1, challenges: {} };
}

function writeChallengeFile(file: ChallengeFile): void {
  const path = settlementChallengeStorePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(file, null, 2), "utf-8");
}

function purgeExpired(file: ChallengeFile): ChallengeFile {
  const now = Date.now();
  const challenges: Record<string, SettlementChallengeRecord> = {};
  for (const [id, c] of Object.entries(file.challenges)) {
    if (Date.parse(c.expires_at) < now && c.status === "pending") {
      challenges[id] = { ...c, status: "expired" };
    } else {
      challenges[id] = c;
    }
  }
  return { version: 1, challenges };
}

/** Resolve materiality tier for an approval (A/B/C). Amount-less → A. */
export function resolveApprovalAssuranceTier(
  approval: OrgApprovalRequest
): OrgApprovalTier {
  const amount = approval.amount;
  if (!amount || amount.value <= 0) return "A";
  try {
    return resolveWireGovernanceTier(amount.value, amount.currency);
  } catch {
    return "C";
  }
}

export function settlementAssuranceRequired(approval: OrgApprovalRequest): boolean {
  if (!isSettlementStepUpEnabled()) return false;
  const tier = resolveApprovalAssuranceTier(approval);
  return tier === "B" || tier === "C";
}

export function assertSettlementAssuranceOrThrow(
  approval: OrgApprovalRequest,
  assertion?: SettlementWebAuthnAssertion & { challenge_id?: string; token?: string }
): {
  settlement_credential_id: string;
  settlement_challenge_id: string;
  settlement_rp_id: string;
} | null {
  if (!settlementAssuranceRequired(approval)) return null;
  if (!assertion?.challenge_id || !assertion.token) {
    throw new SettlementStepUpRequiredError(
      approval.approval_id,
      resolveApprovalAssuranceTier(approval)
    );
  }

  // Already verified by settlement/complete in this flow.
  const existing = peekCompletedSettlement(assertion.challenge_id, assertion.token);
  if (
    existing &&
    existing.approval_id === approval.approval_id &&
    existing.settlement_credential_id === assertion.credential_id
  ) {
    return {
      settlement_credential_id: existing.settlement_credential_id!,
      settlement_challenge_id: existing.challenge_id,
      settlement_rp_id: existing.rp_id,
    };
  }

  return verifySettlementAssertionAndConsume({
    challengeId: assertion.challenge_id,
    token: assertion.token,
    assertion,
    expectedApprovalId: approval.approval_id,
  });
}

function peekCompletedSettlement(
  challengeId: string,
  token: string
): SettlementChallengeRecord | null {
  const file = readChallengeFile();
  const record = file.challenges[challengeId];
  if (!record) return null;
  if (!verifyToken(token, record.challenge_id, record.approval_id, record.operator_id)) {
    return null;
  }
  if (record.status !== "completed" && record.status !== "consumed") return null;
  return record;
}

export function createSettlementChallenge(opts: {
  approval: OrgApprovalRequest;
  operatorId: string;
  approverId: string;
  coApproverId?: string;
  apiOrigin: string;
}): {
  challenge: SettlementChallengeRecord;
  qr: SettlementQrFragment;
  qr_url: string;
  allow_credentials: { id: string; type: "public-key" }[];
} {
  if (!settlementAssuranceRequired(opts.approval)) {
    throw new Error(
      `Approval ${opts.approval.approval_id} does not require settlement step-up`
    );
  }

  const challengeId = `SCH-${randomBytes(12).toString("hex")}`;
  const webauthnChallenge = randomBytes(32).toString("base64url");
  const token = signToken(challengeId, opts.approval.approval_id, opts.operatorId);
  const now = Date.now();
  const tier = resolveApprovalAssuranceTier(opts.approval);
  // Phase 2: same RP as console login (browser hybrid QR on this page).
  const rp = rpId();

  const record: SettlementChallengeRecord = settlementChallengeRecordSchema.parse({
    challenge_id: challengeId,
    token,
    webauthn_challenge: webauthnChallenge,
    approval_id: opts.approval.approval_id,
    operator_id: opts.operatorId,
    approver_id: opts.approverId,
    co_approver_id: opts.coApproverId,
    api_origin: opts.apiOrigin.replace(/\/$/, ""),
    rp_id: rp,
    status: "pending",
    summary: {
      approval_id: opts.approval.approval_id,
      subject_type: opts.approval.subject_type,
      subject_ref: opts.approval.subject_ref,
      message: opts.approval.message,
      amount: opts.approval.amount,
      tier,
      policy_ref: opts.approval.approval_policy_ref,
    },
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + DEFAULT_TTL_MS).toISOString(),
  });

  const file = purgeExpired(readChallengeFile());
  file.challenges[challengeId] = record;
  writeChallengeFile(file);

  const approveOrigin = settlementApproveOrigin().replace(/\/$/, "");
  const qr = settlementQrFragmentSchema.parse({
    v: 1,
    challenge_id: challengeId,
    token,
    api_origin: record.api_origin,
    approve_origin: approveOrigin,
  });

  const allow = listWebAuthnCredentialsByPurpose("settlement", { rpId: rp })
    .filter((c) => c.operator_id === opts.operatorId || c.approver_id === opts.approverId)
    .map((c) => ({
      id: c.credential_id,
      type: "public-key" as const,
      transports: ["hybrid", "internal"] as Array<"hybrid" | "internal">,
    }));

  // Deprecated: ceremony no longer opens this URL (Phase 2). Kept for older clients.
  const fragment = Buffer.from(JSON.stringify(qr), "utf-8").toString("base64url");
  return {
    challenge: record,
    qr,
    qr_url: `${approveOrigin}/?help=1#${fragment}`,
    allow_credentials: allow,
  };
}

export function getSettlementChallengePublic(
  challengeId: string,
  token: string
): {
  challenge_id: string;
  webauthn_challenge: string;
  rp_id: string;
  status: string;
  summary: SettlementChallengeRecord["summary"];
  expires_at: string;
  allow_credentials: { id: string; type: "public-key"; transports?: Array<"hybrid" | "internal"> }[];
  user_verification: "required";
  hints: Array<"hybrid">;
} {
  const file = purgeExpired(readChallengeFile());
  writeChallengeFile(file);
  const record = file.challenges[challengeId];
  if (!record) throw new Error("settlement challenge not found");
  if (!verifyToken(token, record.challenge_id, record.approval_id, record.operator_id)) {
    throw new Error("invalid settlement challenge token");
  }
  if (record.status !== "pending") {
    throw new Error(`settlement challenge status is ${record.status}`);
  }
  if (Date.parse(record.expires_at) < Date.now()) {
    record.status = "expired";
    file.challenges[challengeId] = record;
    writeChallengeFile(file);
    throw new Error("settlement challenge expired");
  }

  const allow = listWebAuthnCredentialsByPurpose("settlement", { rpId: record.rp_id })
    .filter(
      (c) =>
        c.operator_id === record.operator_id || c.approver_id === record.approver_id
    )
    .map((c) => ({
      id: c.credential_id,
      type: "public-key" as const,
      transports: ["hybrid", "internal"] as Array<"hybrid" | "internal">,
    }));

  return {
    challenge_id: record.challenge_id,
    webauthn_challenge: record.webauthn_challenge,
    rp_id: record.rp_id,
    status: record.status,
    summary: record.summary,
    expires_at: record.expires_at,
    allow_credentials: allow,
    user_verification: "required",
    hints: ["hybrid"] as const,
  };
}

export function getSettlementChallengeStatus(
  challengeId: string,
  token: string
): { status: string; approval_id: string; completed_at?: string } {
  const file = readChallengeFile();
  const record = file.challenges[challengeId];
  if (!record) throw new Error("settlement challenge not found");
  if (!verifyToken(token, record.challenge_id, record.approval_id, record.operator_id)) {
    throw new Error("invalid settlement challenge token");
  }
  return {
    status: record.status,
    approval_id: record.approval_id,
    completed_at: record.completed_at,
  };
}

export function verifySettlementAssertionAndConsume(opts: {
  challengeId: string;
  token: string;
  assertion: SettlementWebAuthnAssertion;
  expectedApprovalId?: string;
}): {
  settlement_credential_id: string;
  settlement_challenge_id: string;
  settlement_rp_id: string;
  record: SettlementChallengeRecord;
} {
  const parsed = settlementWebAuthnAssertionSchema.parse(opts.assertion);
  const file = purgeExpired(readChallengeFile());
  const record = file.challenges[opts.challengeId];
  if (!record) throw new Error("settlement challenge not found");
  if (!verifyToken(opts.token, record.challenge_id, record.approval_id, record.operator_id)) {
    throw new Error("invalid settlement challenge token");
  }
  if (opts.expectedApprovalId && opts.expectedApprovalId !== record.approval_id) {
    throw new Error("settlement challenge approval_id mismatch");
  }
  if (record.status !== "pending") {
    throw new Error(`settlement challenge status is ${record.status}`);
  }
  if (Date.parse(record.expires_at) < Date.now()) {
    record.status = "expired";
    file.challenges[opts.challengeId] = record;
    writeChallengeFile(file);
    throw new Error("settlement challenge expired");
  }
  if (parsed.challenge !== record.webauthn_challenge) {
    throw new Error("webauthn challenge mismatch");
  }

  const cred = findWebAuthnCredential(parsed.credential_id);
  if (!cred) throw new Error("unknown settlement credential");
  if (credentialPurpose(cred) !== "settlement") {
    throw new Error("login credential cannot complete settlement step-up");
  }
  if ((cred.rp_id ?? rpId()) !== record.rp_id) {
    throw new Error("settlement credential rp_id mismatch");
  }
  if (
    cred.operator_id !== record.operator_id &&
    cred.approver_id !== record.approver_id
  ) {
    throw new Error("settlement credential operator mismatch");
  }

  let clientData: { type?: string; challenge?: string; origin?: string };
  try {
    clientData = JSON.parse(
      Buffer.from(parsed.client_data_json, "base64url").toString("utf-8")
    );
  } catch {
    throw new Error("invalid client_data_json");
  }
  if (clientData.type !== "webauthn.get" || clientData.challenge !== record.webauthn_challenge) {
    throw new Error("webauthn client data mismatch");
  }
  const expectedOrigin = settlementCeremonyOrigin();
  if (!expectedOrigin || !webauthnOriginsEqual(clientData.origin, expectedOrigin)) {
    throw new Error("settlement webauthn origin mismatch");
  }

  const testSecret = process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET;
  if (testSecret && isWebAuthnTestSecretAllowed() && parsed.signature_base64) {
    if (!expectedOrigin || !webauthnOriginsEqual(clientData.origin, expectedOrigin)) {
      throw new Error("settlement webauthn origin mismatch");
    }
    const expected = Buffer.from(testSecret, "utf-8");
    const got = Buffer.from(parsed.signature_base64, "base64url");
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
      throw new Error("invalid settlement test signature");
    }
  } else {
    if (!parsed.authenticator_data_base64 || !parsed.signature_base64) {
      throw new Error("authenticator_data_base64 and signature_base64 required");
    }
    if (!expectedOrigin) {
      throw new Error("settlement webauthn origin mismatch");
    }
    const verified = verifyWebAuthnAssertion({
      expectedRpId: record.rp_id,
      expectedOrigin,
      clientDataJsonBase64: parsed.client_data_json,
      authenticatorDataBase64: parsed.authenticator_data_base64,
      signatureBase64: parsed.signature_base64,
      publicKeySpkiBase64: cred.public_key_spki_base64,
      previousSignCount: cred.sign_count ?? 0,
    });
    if (!verified.ok) throw new Error(verified.error);
    updateWebAuthnSignCount(parsed.credential_id, verified.signCount);
  }

  const completedAt = new Date().toISOString();
  const next: SettlementChallengeRecord = {
    ...record,
    status: "completed",
    completed_at: completedAt,
    settlement_credential_id: parsed.credential_id,
  };
  file.challenges[opts.challengeId] = next;
  writeChallengeFile(file);

  return {
    settlement_credential_id: parsed.credential_id,
    settlement_challenge_id: record.challenge_id,
    settlement_rp_id: record.rp_id,
    record: next,
  };
}

/** Mark challenge consumed after approval succeeds (idempotent). */
export function markSettlementChallengeConsumed(challengeId: string): void {
  const file = readChallengeFile();
  const record = file.challenges[challengeId];
  if (!record) return;
  if (record.status === "completed" || record.status === "consumed") {
    file.challenges[challengeId] = { ...record, status: "consumed" };
    writeChallengeFile(file);
  }
}

export function resetSettlementChallengesForTests(): void {
  writeChallengeFile({ version: 1, challenges: {} });
}

export function amountRequiresSettlementStepUp(
  amountYen: number,
  currency = "JPY"
): boolean {
  if (!isSettlementStepUpEnabled()) return false;
  if (amountYen <= 0) return false;
  try {
    const tier = resolveWireGovernanceTier(amountYen, currency);
    return tier === "B" || tier === "C";
  } catch {
    return true;
  }
}
