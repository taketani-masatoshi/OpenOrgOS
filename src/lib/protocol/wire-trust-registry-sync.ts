import { readFileSync, writeFileSync } from "node:fs";
import {
  wireTrustRegistrySchema,
  type WireTrustRegistry,
} from "../../../schemas/protocol/wire-trust-registry.js";
import { wireNodeWellKnownSchema } from "../../../schemas/protocol/wire-message.js";
import { getWireTrustRegistryPath } from "./wire-trust-registry.js";
import { readYamlFile } from "../utils.js";
import { setTenantId } from "../tenant.js";
import { ensureProtocolSigningKey, exportProtocolPublicKeyBase64 } from "./signing.js";
import { resolveOpenOrgDid } from "../../../schemas/protocol/openorg-did.js";

export interface WireNodeWellKnownFetch {
  node_id: string;
  protocol_public_key: string;
  did?: string;
  node_uri?: string;
  wire_url: string;
}

export async function fetchWireNodeWellKnown(wireUrl: string): Promise<WireNodeWellKnownFetch> {
  const base = wireUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/.well-known/wire-node.json`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`${base}/.well-known/wire-node.json HTTP ${res.status}`);
  }
  const raw = await res.json();
  const parsed = wireNodeWellKnownSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${base}/.well-known/wire-node.json schema invalid`);
  }
  if (!parsed.data.protocol_public_key?.trim()) {
    throw new Error(`${base}/.well-known/wire-node.json missing protocol_public_key`);
  }
  return {
    node_id: parsed.data.node_id,
    protocol_public_key: parsed.data.protocol_public_key,
    did: parsed.data.did,
    node_uri: parsed.data.node_uri,
    wire_url: base,
  };
}

export interface WireTrustSyncResult {
  node_id: string;
  wire_url?: string;
  status: "updated" | "skipped" | "unchanged" | "error";
  protocol_public_key?: string;
  detail?: string;
}

function patchNodeFieldInYaml(
  yamlText: string,
  nodeId: string,
  field: "protocol_public_key" | "did",
  value: string
): string {
  const lines = yamlText.split("\n");
  let inTarget = false;
  let updated = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const nodeIdMatch = line.match(/^\s*-\s*node_id:\s*(.+)$/);
    if (nodeIdMatch) {
      inTarget = nodeIdMatch[1]!.trim() === nodeId;
      continue;
    }
    if (inTarget && line.match(new RegExp(`^\\s*${field}:\\s*`))) {
      const indent = line.match(/^(\s*)/)?.[1] ?? "    ";
      lines[i] = `${indent}${field}: ${value}`;
      updated = true;
      inTarget = false;
      continue;
    }
    if (inTarget && line.match(/^\s*-\s*node_id:/)) {
      inTarget = false;
    }
  }

  if (!updated) {
    throw new Error(`Could not locate ${field} for node_id ${nodeId} in YAML`);
  }
  return lines.join("\n");
}

export interface SyncWireTrustKeysOptions {
  nodeId?: string;
  wireUrl?: string;
  force?: boolean;
  dryRun?: boolean;
  registryPath?: string;
}

export async function syncWireTrustRegistryPublicKeys(
  opts: SyncWireTrustKeysOptions = {}
): Promise<{ results: WireTrustSyncResult[]; registry: WireTrustRegistry }> {
  const registryPath = opts.registryPath ?? getWireTrustRegistryPath();
  const registry = readYamlFile(registryPath, wireTrustRegistrySchema);
  const results: WireTrustSyncResult[] = [];
  let yamlText = readFileSync(registryPath, "utf-8");

  for (const node of registry.nodes) {
    if (opts.nodeId && node.node_id !== opts.nodeId) continue;

    const wireUrl = opts.wireUrl ?? node.wire_url;
    if (!wireUrl) {
      results.push({
        node_id: node.node_id,
        status: "skipped",
        detail: "no wire_url",
      });
      continue;
    }

    const hasKey = Boolean(node.protocol_public_key?.trim());
    if (hasKey && !opts.force) {
      results.push({
        node_id: node.node_id,
        wire_url: wireUrl,
        status: "skipped",
        protocol_public_key: node.protocol_public_key,
        detail: "protocol_public_key already set (use --force)",
      });
      continue;
    }

    try {
      const fetched = await fetchWireNodeWellKnown(wireUrl);
      if (fetched.node_id !== node.node_id) {
        results.push({
          node_id: node.node_id,
          wire_url: wireUrl,
          status: "error",
          detail: `node_id mismatch: registry=${node.node_id} remote=${fetched.node_id}`,
        });
        continue;
      }

      if (node.protocol_public_key === fetched.protocol_public_key) {
        results.push({
          node_id: node.node_id,
          wire_url: wireUrl,
          status: "unchanged",
          protocol_public_key: fetched.protocol_public_key,
        });
        continue;
      }

      if (!opts.dryRun) {
        yamlText = patchNodeFieldInYaml(
          yamlText,
          node.node_id,
          "protocol_public_key",
          fetched.protocol_public_key
        );
        node.protocol_public_key = fetched.protocol_public_key;
        if (fetched.did && fetched.did !== node.did) {
          try {
            yamlText = patchNodeFieldInYaml(yamlText, node.node_id, "did", fetched.did);
            node.did = fetched.did;
          } catch {
            /* optional did field may be absent */
          }
        }
      }

      results.push({
        node_id: node.node_id,
        wire_url: wireUrl,
        status: "updated",
        protocol_public_key: fetched.protocol_public_key,
        detail: opts.dryRun ? "dry-run" : undefined,
      });
    } catch (e) {
      results.push({
        node_id: node.node_id,
        wire_url: wireUrl,
        status: "error",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (!opts.dryRun && results.some((r) => r.status === "updated")) {
    writeFileSync(registryPath, yamlText.endsWith("\n") ? yamlText : `${yamlText}\n`, "utf-8");
  }

  return { results, registry };
}

export interface PinLocalWireTrustOptions {
  tenant: string;
  nodeId?: string;
  force?: boolean;
  dryRun?: boolean;
  registryPath?: string;
}

/** Pin local tenant signing public key into platform wire-trust-registry.yaml. */
export function pinLocalWireTrustRegistryKeys(
  opts: PinLocalWireTrustOptions
): { results: WireTrustSyncResult[]; registry: WireTrustRegistry } {
  setTenantId(opts.tenant);
  ensureProtocolSigningKey();
  const publicKey = exportProtocolPublicKeyBase64();
  if (!publicKey) {
    throw new Error("signing key unavailable");
  }

  const registryPath = opts.registryPath ?? getWireTrustRegistryPath();
  const registry = readYamlFile(registryPath, wireTrustRegistrySchema);
  const results: WireTrustSyncResult[] = [];
  let yamlText = readFileSync(registryPath, "utf-8");

  const did = resolveOpenOrgDid({ tenantId: opts.tenant, publicKeyBase64: publicKey });
  const candidates = registry.nodes.filter((n) => {
    if (opts.nodeId) return n.node_id === opts.nodeId;
    const tenantFromUri = n.node_uri?.match(/^steward:\/\/tenant\/([^/]+)$/)?.[1];
    return tenantFromUri === opts.tenant || n.did === did || n.node_id === opts.tenant;
  });

  if (!candidates.length) {
    results.push({
      node_id: opts.nodeId ?? opts.tenant,
      status: "error",
      detail: `no registry node matched tenant ${opts.tenant}`,
    });
    return { results, registry };
  }

  for (const node of candidates) {
    const hasKey = Boolean(node.protocol_public_key?.trim());
    if (hasKey && !opts.force) {
      results.push({
        node_id: node.node_id,
        status: "skipped",
        protocol_public_key: node.protocol_public_key,
        detail: "already pinned (use --force)",
      });
      continue;
    }
    if (node.protocol_public_key === publicKey) {
      results.push({
        node_id: node.node_id,
        status: "unchanged",
        protocol_public_key: publicKey,
      });
      continue;
    }
    if (!opts.dryRun) {
      yamlText = patchNodeFieldInYaml(yamlText, node.node_id, "protocol_public_key", publicKey);
      node.protocol_public_key = publicKey;
      if (did && !node.did) {
        try {
          yamlText = patchNodeFieldInYaml(yamlText, node.node_id, "did", did);
          node.did = did;
        } catch {
          /* optional */
        }
      }
    }
    results.push({
      node_id: node.node_id,
      status: "updated",
      protocol_public_key: publicKey,
      detail: opts.dryRun ? "dry-run" : `pinned from tenant ${opts.tenant}`,
    });
  }

  if (!opts.dryRun && results.some((r) => r.status === "updated")) {
    writeFileSync(registryPath, yamlText.endsWith("\n") ? yamlText : `${yamlText}\n`, "utf-8");
  }

  return { results, registry: readYamlFile(registryPath, wireTrustRegistrySchema) };
}
