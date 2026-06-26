#!/usr/bin/env node
/**
 * Standalone OrgOS demo — single tenant, no peers, witness off.
 * Identity · delegation · audit-chain · protocol validate --standalone
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getTenantDir } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { buildIdentityDocument, buildIdentityEnvelope } from "../src/lib/protocol/identity.js";
import { exportDelegationProof, buildDelegationEnvelope } from "../src/lib/protocol/delegation.js";
import { validateProtocolState } from "../src/lib/protocol/validate.js";
import { verifyProtocolAuditChain, appendProtocolAuditRecord } from "../src/lib/protocol/audit-chain.js";
import { ensureProtocolSigningKey, maybeSignEnvelope } from "../src/lib/protocol/signing.js";
import { getWitnessPoolYamlPath } from "../src/lib/protocol/paths.js";
import { witnessPoolConfigSchema } from "../schemas/protocol/witness-pool.js";
import { serializeEventEnvelope } from "../src/lib/protocol/envelope.js";
import { getProtocolOutboxDir } from "../src/lib/protocol/paths.js";

const TENANT = process.env.STANDALONE_DEMO_TENANT ?? "hk-demo";

function resetProtocolScratch(): void {
  for (const base of [
    join(getDataDir(), "protocol"),
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
  const dir = getProtocolOutboxDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${label}-${signed.event_id}.json`), serializeEventEnvelope(signed), "utf-8");
}

function main(): void {
  setTenantId(TENANT);
  console.log(`\n=== Standalone OrgOS demo (${TENANT}) ===\n`);

  resetProtocolScratch();
  ensureProtocolSigningKey();
  ensureWitnessDisabled();

  const identityDoc = buildIdentityDocument({ omitCorporateNumber: true });
  const identityEnvelope = buildIdentityEnvelope(identityDoc);
  archiveEnvelope(identityEnvelope, "01-identity");
  console.log(`✓ org.identity.presented · ${identityEnvelope.event_id.slice(0, 8)}…`);

  const delegationProof = exportDelegationProof({
    scope: "contract.sign",
    granteeAgent: "contract",
  });
  const delegationEnvelope = maybeSignEnvelope(buildDelegationEnvelope(delegationProof));
  appendProtocolAuditRecord({ envelope: delegationEnvelope });
  mkdirSync(getProtocolOutboxDir(), { recursive: true });
  writeFileSync(
    join(getProtocolOutboxDir(), `02-delegation-${delegationEnvelope.event_id}.json`),
    serializeEventEnvelope(delegationEnvelope),
    "utf-8"
  );
  console.log(`✓ org.authority.delegated · basis ${delegationProof.basis_ref}`);

  const audit = verifyProtocolAuditChain();
  if (!audit.ok) {
    console.error("✗ audit-chain verify failed");
    for (const i of audit.issues) console.error(`  ${i.message}`);
    process.exit(1);
  }
  console.log(`✓ audit-chain verify (${audit.checked} record(s))`);

  const validation = validateProtocolState({ standalone: true });
  if (!validation.ok) {
    console.error("✗ protocol validate (standalone) failed");
    for (const i of validation.issues) console.error(`  [${i.code}] ${i.message}`);
    process.exit(1);
  }
  console.log("✓ protocol validate (standalone)");

  console.log("\nStandalone OrgOS demo complete — no peers · witness off\n");
}

main();
