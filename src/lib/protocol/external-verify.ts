import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DelegationProof } from "../../../schemas/protocol/authority-delegation.js";
import { delegationProofSchema } from "../../../schemas/protocol/authority-delegation.js";
import type { EventEnvelope, OrgRef } from "../../../schemas/protocol/org-event.js";
import { eventEnvelopeSchema } from "../../../schemas/protocol/org-event.js";
import { verifyProtocolAuditChain, type AuditVerifyIssue } from "./audit-chain.js";
import { findPeerByOrgRef } from "./inbound-verify.js";
import { ourOrgRef } from "./identity.js";
import { validateProtocolFile } from "./validate.js";
import { loadJsonl } from "../jsonl-store.js";
import { protocolAuditRecordSchema } from "../../../schemas/protocol/audit-record.js";
import {
  getProtocolAuditChainPath,
  getProtocolInboxDir,
  getProtocolOutboxDir,
} from "./paths.js";
import { exportProtocolPublicKeyBase64, verifyEventEnvelopeSignature } from "./signing.js";

export interface ExternalVerifyIssue {
  code: string;
  message: string;
}

export interface ExternalDelegationVerifyResult {
  ok: boolean;
  issues: ExternalVerifyIssue[];
  proof?: DelegationProof;
}

export interface ExternalAuditChainVerifyResult {
  ok: boolean;
  issues: AuditVerifyIssue[];
  warnings: ExternalVerifyIssue[];
  checked: number;
  envelopesLoaded: number;
}

export interface VerifyDelegationProofExternalOptions {
  /** Override grantor protocol public key (base64 SPKI DER). */
  grantorPublicKey?: string;
}

interface ParsedDelegationFile {
  proof: DelegationProof;
  envelope?: EventEnvelope;
}

function resolveGrantorProtocolPublicKey(
  grantor: OrgRef,
  override?: string
): string | undefined {
  if (override) return override;
  const ours = ourOrgRef();
  if (
    grantor.org_id === ours.org_id ||
    (grantor.org_uri && grantor.org_uri === ours.org_uri)
  ) {
    return exportProtocolPublicKeyBase64();
  }
  return findPeerByOrgRef(grantor)?.protocol_public_key;
}

function parseDelegationProofFromFile(filePath: string): ParsedDelegationFile {
  const structural = validateProtocolFile(filePath, "delegation");
  if (!structural.ok) {
    throw new Error(structural.error ?? "invalid delegation file");
  }
  const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as unknown;
  const envelope = eventEnvelopeSchema.safeParse(parsed);
  if (envelope.success) {
    return {
      envelope: envelope.data,
      proof: delegationProofSchema.parse(envelope.data.event.payload.proof),
    };
  }
  return { proof: delegationProofSchema.parse(parsed) };
}

export function verifyDelegationProofExternal(
  filePath: string,
  options?: VerifyDelegationProofExternalOptions
): ExternalDelegationVerifyResult {
  const issues: ExternalVerifyIssue[] = [];
  let parsed: ParsedDelegationFile;
  try {
    parsed = parseDelegationProofFromFile(filePath);
  } catch (e) {
    return {
      ok: false,
      issues: [{ code: "invalid-schema", message: e instanceof Error ? e.message : String(e) }],
    };
  }

  const { proof, envelope } = parsed;

  if (envelope && envelope.event.type !== "org.authority.delegated") {
    issues.push({
      code: "invalid-event-type",
      message: `expected org.authority.delegated, got ${envelope.event.type}`,
    });
  }

  if (envelope) {
    const publicKey = resolveGrantorProtocolPublicKey(proof.grant.grantor, options?.grantorPublicKey);
    if (envelope.signature) {
      if (!publicKey) {
        issues.push({
          code: "missing-grantor-key",
          message: `Cannot verify signature — no protocol_public_key for grantor ${proof.grant.grantor.org_id}`,
        });
      } else if (!verifyEventEnvelopeSignature(envelope, publicKey)) {
        issues.push({
          code: "invalid-signature",
          message: "Delegation envelope signature verification failed",
        });
      }
    } else if (publicKey) {
      issues.push({
        code: "unsigned-envelope",
        message: "Signed grantor key is available but envelope has no signature",
      });
    }
  }

  if (proof.grant.revoked_at) {
    issues.push({ code: "revoked", message: `Grant revoked at ${proof.grant.revoked_at}` });
  }
  if (proof.grant.valid_until) {
    const until = Date.parse(proof.grant.valid_until);
    if (!Number.isNaN(until) && until < Date.now()) {
      issues.push({ code: "expired", message: `Grant expired at ${proof.grant.valid_until}` });
    }
  }
  if (!proof.grant.grantor.org_id) {
    issues.push({ code: "missing-grantor", message: "grantor.org_id is required" });
  }
  if (proof.grant.scope.length === 0) {
    issues.push({ code: "empty-scope", message: "grant.scope must not be empty" });
  }

  return { ok: issues.length === 0, issues, proof };
}

export function loadEnvelopesFromDirectories(dirs: string[]): Map<string, EventEnvelope> {
  const map = new Map<string, EventEnvelope>();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const raw = JSON.parse(readFileSync(join(dir, name), "utf-8")) as unknown;
      const parsed = eventEnvelopeSchema.parse(raw);
      map.set(parsed.event_id, parsed);
    }
  }
  return map;
}

export function verifyAuditChainExternal(options?: {
  chainPath?: string;
  envelopeDirs?: string[];
  since?: string;
  requireEnvelopes?: boolean;
}): ExternalAuditChainVerifyResult {
  const chainPath = options?.chainPath ?? getProtocolAuditChainPath();
  if (!existsSync(chainPath)) {
    return {
      ok: false,
      issues: [{ audit_id: "(chain)", message: `audit chain not found: ${chainPath}` }],
      warnings: [],
      checked: 0,
      envelopesLoaded: 0,
    };
  }

  const dirs =
    options?.envelopeDirs ??
    [getProtocolOutboxDir(), getProtocolInboxDir()];
  const envelopesByEventId = loadEnvelopesFromDirectories(dirs);

  const chain = verifyProtocolAuditChain({
    since: options?.since,
    envelopesByEventId,
    chainPath,
  });

  const warnings: ExternalVerifyIssue[] = [];
  if (options?.requireEnvelopes) {
    const records = loadJsonl(chainPath, (raw) => protocolAuditRecordSchema.parse(raw));
    for (const record of records) {
      if (options.since && record.recorded_at?.slice(0, 10) < options.since) continue;
      if (!envelopesByEventId.has(record.event_id)) {
        warnings.push({
          code: "missing-envelope",
          message: `No envelope file for event_id ${record.event_id} (${record.audit_id})`,
        });
      }
    }
  }

  const ok = chain.ok && !(options?.requireEnvelopes && warnings.length > 0);
  return {
    ok,
    issues: chain.issues,
    warnings,
    checked: chain.checked,
    envelopesLoaded: envelopesByEventId.size,
  };
}
