#!/usr/bin/env node
/**
 * Standalone OrgOS demo steps — shared by hk-demo and mal scripts.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../../src/lib/utils.js";
import { validateAll } from "../../src/lib/data.js";
import { buildIdentityDocument, buildIdentityEnvelope } from "../../src/lib/protocol/identity.js";
import { exportDelegationProof, buildDelegationEnvelope } from "../../src/lib/protocol/delegation.js";
import { resolveJurisdictionApprovalPolicy } from "../../src/lib/jurisdiction/wire-governance/index.js";
import { validateProtocolState } from "../../src/lib/protocol/validate.js";
import { verifyProtocolAuditChain, appendProtocolAuditRecord } from "../../src/lib/protocol/audit-chain.js";
import { ensureProtocolSigningKey, maybeSignEnvelope } from "../../src/lib/protocol/signing.js";
import { getWitnessPoolYamlPath } from "../../src/lib/protocol/paths.js";
import { witnessPoolConfigSchema } from "../../schemas/protocol/witness-pool.js";
import { serializeEventEnvelope } from "../../src/lib/protocol/envelope.js";
import { getProtocolOutboxDir } from "../../src/lib/protocol/paths.js";
import { runWithProtocolWriteGuard } from "../../src/lib/protocol/protocol-write-guard.js";
import { writeOutboxProvenance } from "../../src/lib/protocol/outbox-provenance.js";
import { proposeOrgApproval, approveOrgApproval } from "../../src/lib/org/approval/index.js";
import { loadOrgAuthorizedPersons } from "../../src/lib/org/tenant-data.js";

export interface StandaloneOrgDemoResult {
  tenant: string;
  chainRecords: number;
  approvalEventId?: string;
}

export function resetStandaloneScratch(): void {
  for (const base of [
    join(getDataDir(), "protocol"),
    join(getDataDir(), "org"),
    join(getDocsDir(), "protocol"),
  ]) {
    if (existsSync(base)) rmSync(base, { recursive: true, force: true });
  }
}

function ensureWitnessDisabled(): void {
  const path = getWitnessPoolYamlPath();
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    "# standalone demo — witness off\nenabled: false\nquorum:\n  mode: any_of_n\nhubs: []\n",
    "utf-8"
  );
  witnessPoolConfigSchema.parse({
    enabled: false,
    quorum: { mode: "any_of_n" },
    hubs: [],
  });
}

function archiveEnvelope(envelope: ReturnType<typeof buildIdentityEnvelope>, label: string): void {
  const signed = maybeSignEnvelope(envelope);
  appendProtocolAuditRecord({ envelope: signed });
  runWithProtocolWriteGuard("standalone-org-demo", () => {
    const dir = getProtocolOutboxDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${label}-${signed.event_id}.json`), serializeEventEnvelope(signed), "utf-8");
    writeOutboxProvenance(dir, signed, "standalone-org-demo");
  });
}

export function runStandaloneOrgDemo(tenant: string): StandaloneOrgDemoResult {
  setTenantId(tenant);
  resetStandaloneScratch();
  ensureProtocolSigningKey();
  ensureWitnessDisabled();

  const identityDoc = buildIdentityDocument({ omitCorporateNumber: true });
  const identityEnvelope = buildIdentityEnvelope(identityDoc);
  archiveEnvelope(identityEnvelope, "01-identity");

  const delegationProof = exportDelegationProof({
    scope: "contract.sign",
    granteeAgent: "contract",
    basisRef: resolveJurisdictionApprovalPolicy().policy_ref,
  });
  const delegationEnvelope = maybeSignEnvelope(buildDelegationEnvelope(delegationProof));
  appendProtocolAuditRecord({ envelope: delegationEnvelope });
  runWithProtocolWriteGuard("standalone-org-demo", () => {
    mkdirSync(getProtocolOutboxDir(), { recursive: true });
    writeFileSync(
      join(getProtocolOutboxDir(), `02-delegation-${delegationEnvelope.event_id}.json`),
      serializeEventEnvelope(delegationEnvelope),
      "utf-8"
    );
    writeOutboxProvenance(getProtocolOutboxDir(), delegationEnvelope, "standalone-org-demo");
  });

  const persons = loadOrgAuthorizedPersons();
  const approver =
    persons.directors[0]?.name ??
    persons.representative?.split(/[、,]/)[0]?.trim() ??
    "Director";
  const policyRef = resolveJurisdictionApprovalPolicy().policy_ref;
  const request = proposeOrgApproval({
    scope: "internal",
    subjectType: "regulation.amendment",
    subjectRef: policyRef,
    proposedBy: "secretary",
    amount: { value: 50_000, currency: tenant === "hk-demo" ? "HKD" : "JPY" },
    message: "Standalone internal approval demo",
  });
  const { auditEnvelope } = approveOrgApproval({
    approvalId: request.approval_id,
    approverId: approver,
  });

  const audit = verifyProtocolAuditChain();
  if (!audit.ok) {
    throw new Error(`audit-chain verify failed: ${audit.issues.map((i) => i.message).join("; ")}`);
  }

  const validation = validateProtocolState({ standalone: true });
  if (!validation.ok) {
    throw new Error(
      `protocol validate failed: ${validation.issues.map((i) => `[${i.code}] ${i.message}`).join("; ")}`
    );
  }

  const tenantData = validateAll();
  if (!tenantData.ok) {
    throw new Error(
      `tenant validate failed: ${tenantData.errors.map((e) => `${e.file}: ${e.message}`).join("; ")}`
    );
  }

  return {
    tenant,
    chainRecords: audit.checked,
    approvalEventId: auditEnvelope?.event_id,
  };
}
