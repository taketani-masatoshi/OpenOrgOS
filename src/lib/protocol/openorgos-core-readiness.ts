/**
 * OpenOrgOS Core readiness — LLM-free four elements (equal 25% each).
 * Target 99/100 when all Core wire paths are implemented and tested.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "../tenant.js";
import { resolveTestSuiteVerification } from "./test-suite-status.js";

export interface CoreReadinessCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface OpenOrgOsCoreReadiness {
  eventModel: { score: number; checks: CoreReadinessCheck[] };
  identity: { score: number; checks: CoreReadinessCheck[] };
  authority: { score: number; checks: CoreReadinessCheck[] };
  auditability: { score: number; checks: CoreReadinessCheck[] };
  weighted: number;
  gaps: string[];
}

function fileOk(relativePath: string, detail = "present"): CoreReadinessCheck {
  const path = join(ROOT_DIR, relativePath);
  return { id: relativePath, ok: existsSync(path), detail: existsSync(path) ? detail : "missing" };
}

function bucketScore(checks: CoreReadinessCheck[]): { score: number; checks: CoreReadinessCheck[] } {
  if (checks.length === 0) return { score: 0, checks };
  const passed = checks.filter((c) => c.ok).length;
  return { score: Math.round((passed / checks.length) * 100), checks };
}

export function computeOpenOrgOsCoreReadiness(): OpenOrgOsCoreReadiness {
  const eventModel = bucketScore([
    fileOk("schemas/protocol/org-event.ts", "EventEnvelope schema"),
    fileOk("schemas/protocol/registry.ts", "platform registry"),
    fileOk("src/lib/protocol/envelope.ts", "envelope serialize/parse"),
    fileOk("tests/protocol-org-event.test.ts", "org event tests"),
    fileOk("src/lib/protocol/record-transaction.ts", "transaction → envelope"),
    fileOk("tests/protocol-transaction.test.ts", "transaction tests"),
  ]);

  const identity = bucketScore([
    fileOk("schemas/protocol/identity-exchange.ts", "OrgIdentity schema"),
    fileOk("src/lib/protocol/identity.ts", "identity export"),
    fileOk("src/lib/protocol/inbound-verify.ts", "inbound signature verify"),
    fileOk("tests/org-identity-profile.test.ts", "identity profile tests"),
    fileOk("tests/protocol-webhook-ingest.test.ts", "peer ingest"),
  ]);

  const authority = bucketScore([
    fileOk("schemas/protocol/authority-delegation.ts", "DelegationProof schema"),
    fileOk("schemas/protocol/wire-approval.ts", "wire approval tiers"),
    fileOk("src/lib/org/approval-gate.ts", "approval gate"),
    fileOk("src/lib/wire/notice-workflow.ts", "notice propose/approve"),
    fileOk("tests/wire-approval-gate.test.ts", "wire approval tests"),
    fileOk("tests/protocol-notice-workflow.test.ts", "notice workflow tests"),
  ]);

  const auditability = bucketScore([
    fileOk("src/lib/protocol/audit-chain.ts", "hash-linked audit chain"),
    fileOk("src/lib/protocol/external-verify.ts", "external verify"),
    fileOk("src/lib/org/audit-bridge.ts", "operational → chain bridge"),
    fileOk("tests/protocol-audit.test.ts", "audit chain tests"),
    fileOk("tests/protocol-validate-abnormal.test.ts", "validate abnormal fixtures"),
    fileOk("scripts/validate-protocol-tenants.ts", "CI validate all tenants"),
  ]);

  const weighted = Math.round(
    eventModel.score * 0.25 +
      identity.score * 0.25 +
      authority.score * 0.25 +
      auditability.score * 0.25
  );

  const gaps: string[] = [];
  for (const [label, axis] of [
    ["Event Model", eventModel],
    ["Identity", identity],
    ["Authority", authority],
    ["Auditability", auditability],
  ] as const) {
    const failed = axis.checks.filter((c) => !c.ok);
    if (failed.length) gaps.push(`${label}: ${failed.map((f) => f.id).join(", ")}`);
  }

  return { eventModel, identity, authority, auditability, weighted, gaps };
}

/** Strict Core cap when test suite is not verified (artifact-only scoring). */
export const OPENORGOS_CORE_STRICT_CAP_UNVERIFIED = 92;

/** Strict Core cap when npm test last failed. */
export const OPENORGOS_CORE_STRICT_CAP_TEST_FAILED = 85;

export function computeOpenOrgOsCoreStrictReadiness(): OpenOrgOsCoreReadiness {
  const checklist = computeOpenOrgOsCoreReadiness();
  const verification = resolveTestSuiteVerification();
  const gaps = [...checklist.gaps];

  let weighted: number;
  if (verification.verified && verification.passed) {
    weighted = checklist.weighted;
  } else if (verification.verified && !verification.passed) {
    weighted = Math.min(checklist.weighted, OPENORGOS_CORE_STRICT_CAP_TEST_FAILED);
    gaps.push(`厳格: ${verification.detail}`);
  } else {
    weighted = Math.min(checklist.weighted, OPENORGOS_CORE_STRICT_CAP_UNVERIFIED);
    gaps.push(`厳格 cap ${OPENORGOS_CORE_STRICT_CAP_UNVERIFIED}: ${verification.detail}`);
  }

  return { ...checklist, weighted, gaps };
}
