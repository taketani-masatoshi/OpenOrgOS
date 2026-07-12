/**
 * Phase 4a operational hygiene — keep mal (and peers) wire pilot state coherent
 * across Vitest fixture restore and live verify.
 *
 * Does NOT rotate keys. Only ensures / aligns existing material.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { deriveOpenOrgDidFromPublicKey } from "../../../schemas/protocol/openorg-did.js";
import { ROOT_DIR, getTenantId, setTenantId } from "../tenant.js";
import { registerPeer, findPeer } from "./peers.js";
import { getProtocolSigningKeyPath } from "./paths.js";
import {
  ensureProtocolSigningKey,
  exportProtocolPublicKeyBase64,
  loadSigningKeyMeta,
  saveSigningKeyMeta,
} from "./signing.js";
import { syncWireGatewayDidFromSigningKey } from "./wire-gateway-did-sync.js";
import {
  loadWireTrustRegistry,
  saveWireTrustRegistry,
  getWireTrustRegistryPath,
} from "./wire-trust-registry.js";

export const EMAIL_WIRE_LOOPBACK_PEER_ID = "PEER-003";
export const EMAIL_WIRE_LOOPBACK_EMAIL = "ai+wireloop@malkk.com";

export interface WirePilotHygieneResult {
  tenant: string;
  signing_key: "present" | "restored_backup" | "created";
  signing_meta: "present" | "created" | "updated";
  gateway_did: string;
  gateway_did_updated: boolean;
  mail_config: "present" | "restored" | "missing_example";
  loopback_peer: "present" | "registered" | "updated";
  trust_registry: "aligned" | "updated" | "skipped";
  public_key: string;
}

function mailConfigPaths(tenantId: string): {
  config: string;
  examples: string[];
} {
  const records = join(ROOT_DIR, "tenants", tenantId, "records", "executive");
  return {
    config: join(records, "mail-config.yaml"),
    examples: [
      join(records, "mail-config.mal-pilot.yaml.example"),
      join(ROOT_DIR, "deploy/mal-pilot/mail-config.mal-pilot.yaml.example"),
      join(records, "mail-config.yaml.example"),
    ],
  };
}

/** Restore gitignored mail-config.yaml from tracked example when missing. */
export function ensureMailConfigFromExample(tenantId = getTenantId()): {
  status: WirePilotHygieneResult["mail_config"];
  path: string;
} {
  if (tenantId === "mal") {
    ensureMalMailConfigExampleFiles();
  }
  const paths = mailConfigPaths(tenantId);
  if (existsSync(paths.config)) {
    return { status: "present", path: paths.config };
  }
  const src = paths.examples.find((p) => existsSync(p));
  if (!src) {
    return { status: "missing_example", path: paths.config };
  }
  mkdirSync(dirname(paths.config), { recursive: true });
  cpSync(src, paths.config);
  // Keep Zone C copy of the example when restored from deploy/
  const localExample = join(dirname(paths.config), "mail-config.mal-pilot.yaml.example");
  if (!existsSync(localExample) && src.includes("deploy/mal-pilot")) {
    cpSync(src, localExample);
  }
  return { status: "restored", path: paths.config };
}

/** Ensure email_wire loopback peer pins current signing public key. */
export function ensureEmailWireLoopbackPeer(opts?: {
  tenantId?: string;
  wireEmail?: string;
}): WirePilotHygieneResult["loopback_peer"] {
  const tenantId = opts?.tenantId ?? getTenantId();
  const wireEmail = opts?.wireEmail ?? EMAIL_WIRE_LOOPBACK_EMAIL;
  ensureProtocolSigningKey();
  const publicKey = exportProtocolPublicKeyBase64();
  if (!publicKey) {
    throw new Error("protocol signing public key missing");
  }
  const did = deriveOpenOrgDidFromPublicKey(publicKey);
  const existing = findPeer(EMAIL_WIRE_LOOPBACK_PEER_ID);
  const profile = {
    peer_id: EMAIL_WIRE_LOOPBACK_PEER_ID,
    display_name: "MAL mail loopback (Phase 4)",
    jurisdiction: "JP" as const,
    org_uri: `steward://tenant/${tenantId}`,
    did,
    protocol_public_key: publicKey,
    wire_email: wireEmail,
    inbound_endpoints: [
      {
        url: `smtp://${wireEmail}`,
        transport: "email_wire" as const,
        mode: "push" as const,
        priority: 1,
      },
    ],
  };
  if (!existing) {
    registerPeer(profile);
    return "registered";
  }
  if (
    existing.protocol_public_key !== publicKey ||
    existing.did !== did ||
    existing.wire_email !== wireEmail ||
    existing.org_uri !== profile.org_uri
  ) {
    registerPeer(profile);
    return "updated";
  }
  return "present";
}

/** Prefer restoring rotated backup over minting a new operational key. */
export function tryRestoreSigningKeyFromBackup(): boolean {
  const keyPath = getProtocolSigningKeyPath();
  if (existsSync(keyPath)) return false;
  const dir = dirname(keyPath);
  if (!existsSync(dir)) return false;
  const backups = readdirSync(dir)
    .filter((name) => name.startsWith("signing-key.pem.bak-"))
    .sort()
    .reverse();
  if (!backups[0]) return false;
  copyFileSync(join(dir, backups[0]!), keyPath);
  return true;
}

/** Pin platform wire-trust-registry node for this tenant to the current signing key. */
export function syncTenantNodeInWireTrustRegistry(
  tenantId: string,
  publicKey: string,
  did: string
): "aligned" | "updated" | "skipped" {
  if (process.env.ORGOS_HYGIENE_SKIP_TRUST_REGISTRY === "1") return "skipped";
  try {
    const reg = loadWireTrustRegistry();
    const idx = reg.nodes.findIndex(
      (n) => n.node_id === tenantId || n.node_uri === `steward://tenant/${tenantId}`
    );
    if (idx < 0) return "skipped";
    const node = reg.nodes[idx]!;
    if (node.protocol_public_key === publicKey && node.did === did) {
      return "aligned";
    }
    reg.nodes[idx] = {
      ...node,
      did,
      protocol_public_key: publicKey,
      notes: `${node.notes ?? ""} · hygiene-synced ${new Date().toISOString().slice(0, 10)}`.trim(),
    };
    saveWireTrustRegistry(reg);
    const publishPath = join(ROOT_DIR, "publish/protocol/wire-trust-registry.yaml");
    if (existsSync(publishPath) && publishPath !== getWireTrustRegistryPath()) {
      cpSync(getWireTrustRegistryPath(), publishPath);
    }
    return "updated";
  } catch {
    return "skipped";
  }
}

/**
 * Full pilot hygiene for one tenant (default: current).
 * Safe to run before live verify / ship-gate / after Vitest.
 */
export function runWirePilotHygiene(tenantId?: string): WirePilotHygieneResult {
  const previous = getTenantId();
  const tenant = tenantId ?? previous;
  setTenantId(tenant);
  try {
    let signingKey: WirePilotHygieneResult["signing_key"] = "present";
    if (!exportProtocolPublicKeyBase64()) {
      if (tryRestoreSigningKeyFromBackup()) {
        signingKey = "restored_backup";
      } else {
        ensureProtocolSigningKey();
        signingKey = "created";
      }
    }
    ensureProtocolSigningKey();
    const publicKey = exportProtocolPublicKeyBase64();
    if (!publicKey) {
      throw new Error("protocol signing public key missing after ensure");
    }

    const meta = loadSigningKeyMeta();
    let signingMeta: WirePilotHygieneResult["signing_meta"] = "present";
    if (!meta) {
      saveSigningKeyMeta(publicKey);
      signingMeta = "created";
    } else if (meta.public_key !== publicKey) {
      saveSigningKeyMeta(publicKey);
      signingMeta = "updated";
    }

    const gateway = syncWireGatewayDidFromSigningKey();
    const mail = ensureMailConfigFromExample(tenant);
    const loopback = ensureEmailWireLoopbackPeer({ tenantId: tenant });
    const trust = syncTenantNodeInWireTrustRegistry(tenant, publicKey, gateway.did);

    return {
      tenant,
      signing_key: signingKey,
      signing_meta: signingMeta,
      gateway_did: gateway.did,
      gateway_did_updated: gateway.updated,
      mail_config: mail.status,
      loopback_peer: loopback,
      trust_registry: trust,
      public_key: publicKey,
    };
  } finally {
    if (previous) setTenantId(previous);
  }
}

/** Test / setup helper — records dir may be cursorignored. */
export function ensureMalMailConfigForTests(): void {
  try {
    ensureMalMailConfigExampleFiles();
    ensureMailConfigFromExample("mal");
  } catch {
    /* Zone C / sandbox may block records writes */
  }
}

export function getMalMailConfigExamplePath(): string {
  ensureMalMailConfigExampleFiles();
  const deploy = join(ROOT_DIR, "deploy/mal-pilot/mail-config.mal-pilot.yaml.example");
  if (existsSync(deploy)) return deploy;
  return join(ROOT_DIR, "tenants/mal/records/executive/mail-config.mal-pilot.yaml.example");
}

/** Ensure tracked deploy example is mirrored into tenant records (Zone C may wipe). */
export function ensureMalMailConfigExampleFiles(): {
  deploy: string;
  tenantExample: string;
  copied: boolean;
} {
  const deploy = join(ROOT_DIR, "deploy/mal-pilot/mail-config.mal-pilot.yaml.example");
  const tenantExample = join(
    ROOT_DIR,
    "tenants/mal/records/executive/mail-config.mal-pilot.yaml.example"
  );
  if (!existsSync(deploy)) {
    return { deploy, tenantExample, copied: false };
  }
  mkdirSync(dirname(tenantExample), { recursive: true });
  if (!existsSync(tenantExample)) {
    cpSync(deploy, tenantExample);
    return { deploy, tenantExample, copied: true };
  }
  return { deploy, tenantExample, copied: false };
}

/** Used by setup-restore when executive records dir is empty. */
export function restoreMalMailConfigExampleIfPresent(): void {
  ensureMalMailConfigExampleFiles();
  const example = getMalMailConfigExamplePath();
  if (!existsSync(example)) return;
  const dest = join(ROOT_DIR, "tenants/mal/records/executive/mail-config.yaml");
  if (existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(example, dest);
}
