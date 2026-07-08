import { createHash } from "node:crypto";
import { z } from "zod";

/** OpenOrg DID method — Wire Node / Org identity (WG-4). */
export const OPENORG_DID_METHOD = "ooo";

const ORG_DID_IDENTIFIER = /^[a-z0-9][a-z0-9-]{0,62}$/;

export const openOrgDidSchema = z
  .string()
  .regex(/^did:ooo:org:[a-z0-9][a-z0-9-]{0,62}$/, "expected did:ooo:org:{identifier}");

export type OpenOrgDid = z.output<typeof openOrgDidSchema>;

export function formatOpenOrgDid(identifier: string): OpenOrgDid {
  const id = identifier.toLowerCase();
  if (!ORG_DID_IDENTIFIER.test(id)) {
    throw new Error(`invalid OpenOrg DID identifier: ${identifier}`);
  }
  return openOrgDidSchema.parse(`did:${OPENORG_DID_METHOD}:org:${id}`);
}

export function parseOpenOrgDid(value: string): { method: string; namespace: string; identifier: string } | null {
  const match = value.match(/^did:([a-z0-9]+):([a-z0-9]+):([a-z0-9-]+)$/i);
  if (!match) return null;
  return {
    method: match[1]!.toLowerCase(),
    namespace: match[2]!.toLowerCase(),
    identifier: match[3]!.toLowerCase(),
  };
}

export function isOpenOrgDid(value: string): value is OpenOrgDid {
  return openOrgDidSchema.safeParse(value).success;
}

/** Tenant-scoped DID — human-readable default for WG-4. */
export function deriveOpenOrgDidFromTenant(tenantId: string): OpenOrgDid {
  return formatOpenOrgDid(tenantId.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
}

/** Content-addressed fallback DID from protocol signing public key (SPKI DER base64). */
export function deriveOpenOrgDidFromPublicKey(publicKeyBase64: string): OpenOrgDid {
  const digest = createHash("sha256")
    .update(Buffer.from(publicKeyBase64, "base64"))
    .digest("hex")
    .slice(0, 16);
  return formatOpenOrgDid(`pk-${digest}`);
}

export function resolveOpenOrgDid(opts: {
  configured?: string;
  tenantId?: string;
  publicKeyBase64?: string;
}): OpenOrgDid | undefined {
  if (opts.configured && isOpenOrgDid(opts.configured)) return opts.configured;
  if (opts.tenantId) return deriveOpenOrgDidFromTenant(opts.tenantId);
  if (opts.publicKeyBase64) return deriveOpenOrgDidFromPublicKey(opts.publicKeyBase64);
  return undefined;
}
