import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  deriveOpenOrgDidFromPublicKey,
  type OpenOrgDid,
} from "../../../schemas/protocol/openorg-did.js";
import { ensureProtocolSigningKey, exportProtocolPublicKeyBase64 } from "./signing.js";
import { getProtocolDataDir } from "./paths.js";

/**
 * Ensure signing key exists and pin wire-gateway.yaml `did` to the key's pk-DID.
 * Lives under protocol/ to avoid wire-gateway ↔ commands circular imports.
 */
export function syncWireGatewayDidFromSigningKey(): {
  did: OpenOrgDid;
  public_key: string;
  updated: boolean;
  path: string;
} {
  ensureProtocolSigningKey();
  const publicKey = exportProtocolPublicKeyBase64();
  if (!publicKey) {
    throw new Error("protocol signing public key missing after ensure");
  }
  const did = deriveOpenOrgDidFromPublicKey(publicKey);
  const path = join(getProtocolDataDir(), "wire-gateway.yaml");
  if (!existsSync(path)) {
    return { did, public_key: publicKey, updated: false, path };
  }
  const raw = readFileSync(path, "utf-8");
  const current = raw.match(/^did:\s*(.+)$/m)?.[1]?.trim();
  if (current === did) {
    return { did, public_key: publicKey, updated: false, path };
  }
  const next = raw.match(/^did:\s*/m)
    ? raw.replace(/^did:\s*.+$/m, `did: ${did}`)
    : `${raw.replace(/\s*$/, "")}\ndid: ${did}\n`;
  writeFileSync(path, next, "utf-8");
  return { did, public_key: publicKey, updated: true, path };
}
