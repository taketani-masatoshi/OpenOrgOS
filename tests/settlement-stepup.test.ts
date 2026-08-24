import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  amountRequiresSettlementStepUp,
  createSettlementChallenge,
  getSettlementChallengePublic,
  resetSettlementChallengesForTests,
  resolveApprovalAssuranceTier,
  settlementAssuranceRequired,
  SettlementStepUpRequiredError,
  verifySettlementAssertionAndConsume,
} from "../src/lib/org/settlement-stepup.js";
import { assertSettlementAssuranceOrThrow } from "../src/lib/org/settlement-stepup.js";
import {
  listWebAuthnCredentialsByPurpose,
  resetWebAuthnCredentialsForTests,
  setWebAuthnCredentialsForTests,
} from "../src/lib/wire-console/auth/webauthn-store.js";
import { createWebAuthnLoginOptions } from "../src/lib/wire-console/auth/webauthn.js";
import { resetWebAuthnChallengeStoreForTests } from "../src/lib/wire-console/auth/webauthn-challenge-store.js";
import { buildTestAuthenticatorData } from "../src/lib/wire-console/auth/webauthn-verify.js";
import type { OrgApprovalRequest } from "../schemas/org/approval.js";

function approval(partial: Partial<OrgApprovalRequest> & { approval_id: string }): OrgApprovalRequest {
  return {
    scope: "internal",
    status: "pending_approval",
    proposed_at: new Date().toISOString(),
    proposed_by: "OP-001",
    subject_type: "expenditure.capex",
    ...partial,
  };
}

describe("settlement step-up (ADR 0037)", () => {
  let prevStepUp: string | undefined;
  let prevStore: string | undefined;
  let prevTestSecret: string | undefined;
  let prevAllowTest: string | undefined;
  let prevApproveOrigin: string | undefined;
  let prevRpId: string | undefined;
  let prevWaOrigin: string | undefined;
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "orgos-settlement-"));
    prevStepUp = process.env.ORGOS_SETTLEMENT_STEPUP;
    prevStore = process.env.ORGOS_SETTLEMENT_CHALLENGE_STORE;
    prevTestSecret = process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET;
    prevAllowTest = process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET;
    prevApproveOrigin = process.env.ORGOS_SETTLEMENT_APPROVE_ORIGIN;
    prevRpId = process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID;
    prevWaOrigin = process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN;
    process.env.ORGOS_SETTLEMENT_STEPUP = "1";
    process.env.ORGOS_SETTLEMENT_CHALLENGE_STORE = join(tmp, "challenges.json");
    process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET = "test-settlement-secret";
    process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET = "1";
    process.env.ORGOS_SETTLEMENT_APPROVE_ORIGIN = "https://approve.oorgos.org";
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "127.0.0.1";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "http://127.0.0.1:9470";
    resetSettlementChallengesForTests();
    resetWebAuthnCredentialsForTests();
    resetWebAuthnChallengeStoreForTests();
  });

  afterEach(() => {
    if (prevStepUp === undefined) delete process.env.ORGOS_SETTLEMENT_STEPUP;
    else process.env.ORGOS_SETTLEMENT_STEPUP = prevStepUp;
    if (prevStore === undefined) delete process.env.ORGOS_SETTLEMENT_CHALLENGE_STORE;
    else process.env.ORGOS_SETTLEMENT_CHALLENGE_STORE = prevStore;
    if (prevTestSecret === undefined) delete process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET;
    else process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET = prevTestSecret;
    if (prevAllowTest === undefined) delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET;
    else process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET = prevAllowTest;
    if (prevApproveOrigin === undefined) delete process.env.ORGOS_SETTLEMENT_APPROVE_ORIGIN;
    else process.env.ORGOS_SETTLEMENT_APPROVE_ORIGIN = prevApproveOrigin;
    if (prevRpId === undefined) delete process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID;
    else process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = prevRpId;
    if (prevWaOrigin === undefined) delete process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN;
    else process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = prevWaOrigin;
    resetWebAuthnCredentialsForTests();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("maps amounts to assurance tiers", () => {
    expect(resolveApprovalAssuranceTier(approval({ approval_id: "APR-20260817-001" }))).toBe("A");
    expect(
      resolveApprovalAssuranceTier(
        approval({
          approval_id: "APR-20260817-002",
          amount: { value: 50_000, currency: "JPY" },
        })
      )
    ).toBe("A");
    expect(
      resolveApprovalAssuranceTier(
        approval({
          approval_id: "APR-20260817-003",
          amount: { value: 500_000, currency: "JPY" },
        })
      )
    ).toBe("B");
    expect(
      resolveApprovalAssuranceTier(
        approval({
          approval_id: "APR-20260817-004",
          amount: { value: 2_000_000, currency: "JPY" },
        })
      )
    ).toBe("C");
  });

  it("requires settlement for B/C only", () => {
    expect(
      settlementAssuranceRequired(
        approval({
          approval_id: "APR-20260817-010",
          amount: { value: 10_000, currency: "JPY" },
        })
      )
    ).toBe(false);
    expect(
      settlementAssuranceRequired(
        approval({
          approval_id: "APR-20260817-011",
          amount: { value: 200_000, currency: "JPY" },
        })
      )
    ).toBe(true);
    expect(amountRequiresSettlementStepUp(200_000)).toBe(true);
    expect(amountRequiresSettlementStepUp(50_000)).toBe(false);
  });

  it("login options exclude settlement credentials", () => {
    setWebAuthnCredentialsForTests([
      {
        credential_id: "login-cred",
        public_key_spki_base64: "AAAA",
        operator_id: "OP-001",
        approver_id: "CEO",
        purpose: "login",
        rp_id: "127.0.0.1",
      },
      {
        credential_id: "settle-cred",
        public_key_spki_base64: "BBBB",
        operator_id: "OP-001",
        approver_id: "CEO",
        purpose: "settlement",
        rp_id: "127.0.0.1",
      },
    ]);
    const opts = createWebAuthnLoginOptions();
    expect(opts.allow_credentials.map((c) => c.id)).toEqual(["login-cred"]);
    expect(listWebAuthnCredentialsByPurpose("settlement").map((c) => c.credential_id)).toEqual([
      "settle-cred",
    ]);
  });

  it("throws step_up_required without assertion for tier B", () => {
    const a = approval({
      approval_id: "APR-20260817-020",
      amount: { value: 250_000, currency: "JPY" },
    });
    expect(() => assertSettlementAssuranceOrThrow(a)).toThrow(SettlementStepUpRequiredError);
  });

  it("creates challenge and completes with test assertion", () => {
    setWebAuthnCredentialsForTests([
      {
        credential_id: "settle-cred",
        public_key_spki_base64: "BBBB",
        operator_id: "OP-001",
        approver_id: "CEO",
        purpose: "settlement",
        rp_id: "127.0.0.1",
      },
    ]);

    const a = approval({
      approval_id: "APR-20260817-030",
      amount: { value: 250_000, currency: "JPY" },
      message: "capex test",
    });

    const created = createSettlementChallenge({
      approval: a,
      operatorId: "OP-001",
      approverId: "CEO",
      apiOrigin: "https://tenant.example",
    });
    expect(created.challenge.rp_id).toBe("127.0.0.1");
    expect(created.qr_url).toContain("help=1");
    expect(created.challenge.summary.tier).toBe("B");

    const pub = getSettlementChallengePublic(
      created.challenge.challenge_id,
      created.challenge.token
    );
    expect(pub.webauthn_challenge).toBe(created.challenge.webauthn_challenge);

    const clientData = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge: created.challenge.webauthn_challenge,
        origin: "http://127.0.0.1:9470",
      }),
      "utf-8"
    ).toString("base64url");

    const authDataBase64 = buildTestAuthenticatorData("127.0.0.1").toString("base64url");

    const verified = verifySettlementAssertionAndConsume({
      challengeId: created.challenge.challenge_id,
      token: created.challenge.token,
      assertion: {
        credential_id: "settle-cred",
        challenge: created.challenge.webauthn_challenge,
        client_data_json: clientData,
        authenticator_data_base64: authDataBase64,
        signature_base64: Buffer.from("test-settlement-secret", "utf-8").toString("base64url"),
      },
      expectedApprovalId: a.approval_id,
    });
    expect(verified.settlement_credential_id).toBe("settle-cred");

    // login credential cannot complete
    setWebAuthnCredentialsForTests([
      {
        credential_id: "login-only",
        public_key_spki_base64: "AAAA",
        operator_id: "OP-001",
        approver_id: "CEO",
        purpose: "login",
        rp_id: "127.0.0.1",
      },
    ]);
    const created2 = createSettlementChallenge({
      approval: approval({
        approval_id: "APR-20260817-031",
        amount: { value: 300_000, currency: "JPY" },
      }),
      operatorId: "OP-001",
      approverId: "CEO",
      apiOrigin: "https://tenant.example",
    });
    const clientData2 = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge: created2.challenge.webauthn_challenge,
        origin: "http://127.0.0.1:9470",
      }),
      "utf-8"
    ).toString("base64url");
    expect(() =>
      verifySettlementAssertionAndConsume({
        challengeId: created2.challenge.challenge_id,
        token: created2.challenge.token,
        assertion: {
          credential_id: "login-only",
          challenge: created2.challenge.webauthn_challenge,
          client_data_json: clientData2,
          authenticator_data_base64: authDataBase64,
          signature_base64: Buffer.from("test-settlement-secret", "utf-8").toString("base64url"),
        },
      })
    ).toThrow(/login credential cannot complete settlement/);
  });

  it("rejects reused challenge", () => {
    setWebAuthnCredentialsForTests([
      {
        credential_id: "settle-cred",
        public_key_spki_base64: "BBBB",
        operator_id: "OP-001",
        approver_id: "CEO",
        purpose: "settlement",
        rp_id: "127.0.0.1",
      },
    ]);
    const a = approval({
      approval_id: "APR-20260817-040",
      amount: { value: 250_000, currency: "JPY" },
    });
    const created = createSettlementChallenge({
      approval: a,
      operatorId: "OP-001",
      approverId: "CEO",
      apiOrigin: "https://tenant.example",
    });
    const clientData = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge: created.challenge.webauthn_challenge,
        origin: "http://127.0.0.1:9470",
      }),
      "utf-8"
    ).toString("base64url");
    const authDataBase64 = buildTestAuthenticatorData("127.0.0.1").toString("base64url");
    const assertion = {
      credential_id: "settle-cred",
      challenge: created.challenge.webauthn_challenge,
      client_data_json: clientData,
      authenticator_data_base64: authDataBase64,
      signature_base64: Buffer.from("test-settlement-secret", "utf-8").toString("base64url"),
    };
    verifySettlementAssertionAndConsume({
      challengeId: created.challenge.challenge_id,
      token: created.challenge.token,
      assertion,
    });
    expect(() =>
      verifySettlementAssertionAndConsume({
        challengeId: created.challenge.challenge_id,
        token: created.challenge.token,
        assertion,
      })
    ).toThrow(/status is completed/);
  });
});
