/** Identity, delegation, and signing command handlers. */
import { applyProtocolTenant } from "./shared.js";
import {
  buildIdentityDocument,
  buildIdentityEnvelope,
} from "../../lib/protocol/core/identity.js";
import {
  exportDelegationProof,
  buildDelegationEnvelope,
} from "../../lib/protocol/core/delegation.js";
import { validateProtocolFile } from "../../lib/protocol/core/validate.js";
import { verifyDelegationProofExternal } from "../../lib/protocol/core/external-verify.js";
import { resolveJurisdictionApprovalPolicy } from "../../lib/jurisdiction/wire-governance/index.js";
import {
  exportProtocolPublicKeyBase64,
  ensureProtocolSigningKey,
  rotateProtocolSigningKey,
} from "../../lib/protocol/core/signing.js";
import { findPeer } from "../../lib/protocol/transport/peers.js";


export interface ProtocolIdentityExportOptions {
  peer?: string;
  stakeholder?: string;
  json?: boolean;
  tenant?: string;
}

export function runProtocolIdentityExport(opts: ProtocolIdentityExportOptions): void {
  applyProtocolTenant(opts.tenant);
  const doc = buildIdentityDocument({ stakeholderId: opts.stakeholder });
  let destination;
  if (opts.peer) {
    const peer = findPeer(opts.peer);
    if (!peer) {
      console.error(`Peer ${opts.peer} not found`);
      process.exit(1);
    }
    destination = { org_id: peer.peer_id, org_uri: peer.org_uri };
  }
  const envelope = buildIdentityEnvelope(doc, destination);
  if (opts.json) {
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }
  console.log(`✓ Identity envelope ${envelope.event_id}`);
  console.log(`  org: ${doc.display_name} (${doc.jurisdiction})`);
}

export interface ProtocolIdentityValidateOptions {
  file: string;
}

export function runProtocolIdentityValidate(opts: ProtocolIdentityValidateOptions): void {
  const result = validateProtocolFile(opts.file, "identity");
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  console.log("✓ Identity document valid");
}

export interface ProtocolDelegationExportOptions {
  scope: string;
  granteeAgent: string;
  basisRef?: string;
  json?: boolean;
  tenant?: string;
}

export function runProtocolDelegationExport(opts: ProtocolDelegationExportOptions): void {
  applyProtocolTenant(opts.tenant);
  try {
    const basisRef =
      opts.basisRef ?? resolveJurisdictionApprovalPolicy().policy_ref;
    const proof = exportDelegationProof({
      scope: opts.scope,
      granteeAgent: opts.granteeAgent,
      basisRef,
    });
    const envelope = buildDelegationEnvelope(proof);
    if (opts.json) {
      console.log(JSON.stringify(envelope, null, 2));
      return;
    }
    console.log(`✓ Delegation proof ${proof.grant.grant_id}`);
    console.log(`  scope: ${proof.grant.scope.join(", ")}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

export interface ProtocolDelegationValidateOptions {
  file: string;
}

export function runProtocolDelegationValidate(opts: ProtocolDelegationValidateOptions): void {
  const result = verifyDelegationProofExternal(opts.file);
  if (!result.ok) {
    for (const issue of result.issues) {
      console.error(`${issue.code}: ${issue.message}`);
    }
    process.exit(1);
  }
  console.log(`✓ Delegation proof valid · ${result.proof?.grant.grant_id ?? ""}`);
}

export interface ProtocolVerifyDelegationOptions {
  file: string;
  json?: boolean;
}

export function runProtocolVerifyDelegation(opts: ProtocolVerifyDelegationOptions): void {
  const result = verifyDelegationProofExternal(opts.file);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.ok) {
    for (const issue of result.issues) {
      console.error(`${issue.code}: ${issue.message}`);
    }
    process.exit(1);
  }
  console.log(`✓ Delegation proof verified · ${result.proof?.grant.grant_id ?? ""}`);
}

export interface ProtocolSigningExportOptions {
  tenant?: string;
  json?: boolean;
}

export function runProtocolSigningExportPublic(opts: ProtocolSigningExportOptions): void {
  applyProtocolTenant(opts.tenant);
  ensureProtocolSigningKey();
  const publicKey = exportProtocolPublicKeyBase64();
  if (!publicKey) {
    console.error("No signing key — run notice approve once or ensure data/protocol/signing-key.pem");
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify({ protocol_public_key: publicKey }, null, 2));
    return;
  }
  console.log(publicKey);
}

export interface ProtocolSigningRotateOptions {
  tenant?: string;
  json?: boolean;
}

export function runProtocolSigningRotate(opts: ProtocolSigningRotateOptions): void {
  applyProtocolTenant(opts.tenant);
  const result = rotateProtocolSigningKey();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("✓ Protocol signing key rotated");
  console.log(`  protocol_public_key: ${result.publicKey}`);
  if (result.backupPath) {
    console.log(`  backup: ${result.backupPath}`);
  }
  console.log("  Re-share public key with peers after rotation.");
}

