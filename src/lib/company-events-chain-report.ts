/**
 * Company event chain verification — shared by CLI and Console BFF.
 * Path: src/lib/company-events-chain-report.ts
 * ADR: docs/adr/0045-company-events-chain-trust-anchor.md
 */
import {
  initCompanyEventsFile,
  loadCompanyEvents,
  verifyCompanyEventChain,
} from "./company-events.js";
import { validateCompanyEventChainWithRegistry } from "./company-events-chain.js";
import { verifyCompanyEventsWitnessPin } from "./company-events-witness-pin.js";
import {
  getAttestationCorruptLines,
  loadCompanyEventsAttestations,
  verifyAttestationSequence,
  verifyCompanyEventsAttestation,
} from "./company-events-attestation.js";

export type CompanyEventChainIssue = {
  code: string;
  message: string;
};

export type CompanyEventChainReport = {
  ok: boolean;
  chain_checked: number;
  registry_events: number;
  issues: CompanyEventChainIssue[];
};

/** Aggregate chain + registry + witness pin + attestation checks. Read-only. */
export function buildCompanyEventChainReport(opts?: {
  strictLegacy?: boolean;
}): CompanyEventChainReport {
  initCompanyEventsFile();
  const registry = loadCompanyEvents();
  const chain = verifyCompanyEventChain();
  const cross = validateCompanyEventChainWithRegistry(registry);
  const pin = verifyCompanyEventsWitnessPin();
  const issues: CompanyEventChainIssue[] = [...chain.issues, ...cross.issues];

  if (!pin.ok) {
    issues.push({
      code: pin.code ?? "witness-pin-mismatch",
      message: pin.message ?? "Witness pin does not match chain tail",
    });
  }

  const attestations = loadCompanyEventsAttestations();
  for (const lineNo of getAttestationCorruptLines()) {
    issues.push({
      code: "attestation-corrupt-line",
      message: `Corrupt JSONL line ${lineNo} in company-events-attestations.jsonl`,
    });
  }
  for (const seqIssue of verifyAttestationSequence(attestations)) {
    issues.push({ code: seqIssue.code, message: seqIssue.message });
  }

  if (opts?.strictLegacy) {
    for (const att of attestations) {
      const result = verifyCompanyEventsAttestation(att, { strictLegacy: true });
      if (!result.ok) {
        issues.push({
          code: result.reason ?? "attestation-invalid",
          message: `Attestation ${att.attestation_id} failed strict verification`,
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    chain_checked: chain.checked,
    registry_events: registry.events.length,
    issues,
  };
}
