import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createCompanyEvent, loadCompanyEvents } from "../company-events.js";
import { validateCompanyEventChainWithRegistry } from "../company-events-chain.js";
import { pinCompanyEventChainTail, verifyCompanyEventsWitnessPin } from "../company-events-witness-pin.js";
import { getCliOperatorContext } from "../console-auth/cli-operator.js";
import { requireOperatorPermission } from "../console-auth/operator-rbac.js";
import { loadTaxProfile } from "../data.js";
import { getDataDir, resolveTenantPath } from "../utils.js";
import { writeYamlFileAtomic } from "../yaml-atomic.js";

export type ConsumptionTaxAdvisorDecision = "approved" | "rejected";

export type ConsumptionTaxAdvisorReviewPayload = {
  fiscal_year: string;
  status: ConsumptionTaxAdvisorDecision;
  reviewer_ref: string;
  professional_registration_ref: string;
  qualification_evidence_ref: string;
  qualification_evidence_sha256: string;
  reviewed_at: string;
  evidence_ref: string;
  evidence_sha256: string;
  calculation_sha256: string;
};

function canonicalPayload(payload: ConsumptionTaxAdvisorReviewPayload): string {
  const bound: ConsumptionTaxAdvisorReviewPayload = {
    fiscal_year: payload.fiscal_year,
    status: payload.status,
    reviewer_ref: payload.reviewer_ref,
    professional_registration_ref: payload.professional_registration_ref,
    qualification_evidence_ref: payload.qualification_evidence_ref,
    qualification_evidence_sha256: payload.qualification_evidence_sha256,
    reviewed_at: payload.reviewed_at,
    evidence_ref: payload.evidence_ref,
    evidence_sha256: payload.evidence_sha256,
    calculation_sha256: payload.calculation_sha256,
  };
  return JSON.stringify(Object.fromEntries(Object.entries(bound).sort(([left], [right]) => left.localeCompare(right))));
}

export function advisorReviewPayloadDigest(payload: ConsumptionTaxAdvisorReviewPayload): string {
  return createHash("sha256").update(canonicalPayload(payload)).digest("hex");
}

function eventTitle(payload: ConsumptionTaxAdvisorReviewPayload): string {
  return `Consumption tax advisor review ${advisorReviewPayloadDigest(payload)}`;
}

export function verifyConsumptionTaxAdvisorReviewAudit(
  payload: ConsumptionTaxAdvisorReviewPayload & { audit_event_id?: string },
): { ok: boolean; reason?: string } {
  if (!payload.audit_event_id) return { ok: false, reason: "advisor review audit event missing" };
  const registry = loadCompanyEvents();
  const chain = validateCompanyEventChainWithRegistry(registry);
  if (!chain.ok) return { ok: false, reason: "company event chain invalid" };
  const witness = verifyCompanyEventsWitnessPin();
  if (!witness.ok) return { ok: false, reason: `company event witness invalid: ${witness.code}` };
  const event = registry.events.find((row) => row.id === payload.audit_event_id);
  if (!event) return { ok: false, reason: "advisor review audit event not found" };
  if (!event.chain_seq || !witness.pin || witness.pin.chain_tail_seq < event.chain_seq) {
    return { ok: false, reason: "advisor review event is not covered by the witness pin" };
  }
  if (event.kind !== "compliance" || event.title !== eventTitle(payload)) {
    return { ok: false, reason: "advisor review audit event payload mismatch" };
  }
  return { ok: true };
}

export function recordConsumptionTaxAdvisorReview(
  input: Omit<ConsumptionTaxAdvisorReviewPayload, "evidence_sha256" | "qualification_evidence_sha256"> & { evidence_sha256?: string; qualification_evidence_sha256?: string },
): { audit_event_id: string } {
  const auth = getCliOperatorContext();
  if (!auth) throw new Error("advisor review requires an authenticated operator context");
  requireOperatorPermission(auth, "chat:approve");
  if (auth.record.operator_id !== input.reviewer_ref) throw new Error("reviewer_ref must match the authenticated operator");
  const evidencePath = resolveTenantPath(input.evidence_ref);
  const evidenceSha256 = createHash("sha256").update(readFileSync(evidencePath)).digest("hex");
  if (input.evidence_sha256 && input.evidence_sha256 !== evidenceSha256) throw new Error("advisor review evidence SHA-256 mismatch");
  const qualificationPath = resolveTenantPath(input.qualification_evidence_ref);
  const qualificationEvidenceSha256 = createHash("sha256").update(readFileSync(qualificationPath)).digest("hex");
  if (input.qualification_evidence_sha256 && input.qualification_evidence_sha256 !== qualificationEvidenceSha256) throw new Error("advisor qualification evidence SHA-256 mismatch");
  const payload: ConsumptionTaxAdvisorReviewPayload = { ...input, evidence_sha256: evidenceSha256, qualification_evidence_sha256: qualificationEvidenceSha256 };
  const profile = loadTaxProfile() as Record<string, unknown> & {
    consumption_tax?: Record<string, unknown> & { advisor_reviews?: Array<Record<string, unknown>> };
  };
  if (!profile.consumption_tax) throw new Error("consumption tax profile missing");
  const current = profile.consumption_tax.advisor_reviews ?? [];
  if (current.some((review) => review.fiscal_year === payload.fiscal_year)) {
    throw new Error(`advisor review already recorded for ${payload.fiscal_year}`);
  }
  const title = eventTitle(payload);
  const existingEvent = loadCompanyEvents().events.find((event) => event.kind === "compliance" && event.title === title);
  const event = existingEvent ?? createCompanyEvent({
      kind: "compliance",
      title,
      occurredAt: payload.reviewed_at.slice(0, 10),
      slug: `consumption-tax-${payload.fiscal_year.toLowerCase()}-${payload.status}`,
      related: {
        fiscal_year: payload.fiscal_year,
        reviewer_ref: payload.reviewer_ref,
        professional_registration_ref: payload.professional_registration_ref,
        qualification_evidence_sha256: payload.qualification_evidence_sha256,
        calculation_sha256: payload.calculation_sha256,
        evidence_sha256: payload.evidence_sha256,
      },
      notes: `Consumption-tax advisor decision: ${payload.status}. Evidence: ${payload.evidence_ref}`,
    });
  pinCompanyEventChainTail({ hubId: "consumption-tax-advisor-review" });
  profile.consumption_tax.advisor_reviews = [...current, { ...payload, audit_event_id: event.id }];
  writeYamlFileAtomic(join(getDataDir(), "finance", "tax-profile.yaml"), profile);
  return { audit_event_id: event.id };
}
