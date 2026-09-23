/**
 * Normative Core / Transport / Distribution / Adapter / Readiness layer catalog.
 * Physical modules may still re-export compatibility barrels during staged migration.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT_DIR } from "../tenant.js";

export type ProtocolLayer = "core" | "transport" | "distribution" | "adapters" | "readiness";

/** Lower rank may not import higher rank (readiness is sink: only commands may import it). */
export const PROTOCOL_LAYER_RANK: Record<ProtocolLayer, number> = {
  core: 0,
  transport: 1,
  distribution: 2,
  adapters: 3,
  readiness: 4,
};

export interface ProtocolLayerModule {
  layer: ProtocolLayer;
  path: string;
  role: string;
}

/** Staged barrel / submodule contract entries (must exist). */
export const PROTOCOL_LAYER_MODULES: readonly ProtocolLayerModule[] = [
  { layer: "core", path: "src/lib/protocol/core/index.ts", role: "event · identity · audit" },
  { layer: "transport", path: "src/lib/protocol/transport/index.ts", role: "wire delivery facade" },
  { layer: "transport", path: "src/lib/protocol/transport/types.ts", role: "delivery result types" },
  { layer: "transport", path: "src/lib/protocol/transport/dns.ts", role: "peer endpoint DNS resolution" },
  { layer: "transport", path: "src/lib/protocol/transport/inbound.ts", role: "inbound mirror · pull" },
  { layer: "transport", path: "src/lib/protocol/transport/relay.ts", role: "relay inbox flush" },
  { layer: "distribution", path: "src/lib/protocol/distribution/index.ts", role: "witness · hub · relay worker" },
  { layer: "adapters", path: "src/lib/protocol/adapters/index.ts", role: "email_wire · webhook bridge" },
  { layer: "adapters", path: "src/lib/wire/gov-gateway/deliver.ts", role: "gov gateway adapter (optional)" },
] as const;

/**
 * Ownership map for every implementation module under src/lib/protocol/.
 * Paths are repo-relative; physical location may still be flat during migration.
 */
export const PROTOCOL_FILE_LAYER: Readonly<Record<string, ProtocolLayer>> = {
  // core
  "src/lib/protocol/core/audit-chain.ts": "core",
  "src/lib/protocol/core/canonical.ts": "core",
  "src/lib/protocol/core/delegation.ts": "core",
  "src/lib/protocol/core/envelope.ts": "core",
  "src/lib/protocol/core/external-verify.ts": "core",
  "src/lib/protocol/core/identity.ts": "core",
  "src/lib/protocol/core/inbound-verify.ts": "core",
  "src/lib/protocol/core/outbox-permissions.ts": "core",
  "src/lib/protocol/core/outbox-provenance.ts": "core",
  "src/lib/protocol/core/paths.ts": "core",
  "src/lib/protocol/core/protocol-write-guard.ts": "core",
  "src/lib/protocol/core/record-transaction.ts": "core",
  "src/lib/protocol/core/redact-secrets.ts": "core",
  "src/lib/protocol/core/signing.ts": "core",
  "src/lib/protocol/core/transactions.ts": "core",
  "src/lib/protocol/core/validate.ts": "core",
  "src/lib/protocol/core/wire-counterparty.ts": "core",

  // transport
  "src/lib/protocol/transport/delivery-ledger.ts": "transport",
  "src/lib/protocol/transport/dev-server-tls.ts": "transport",
  "src/lib/protocol/transport/inbox-export.ts": "transport",
  "src/lib/protocol/transport/legacy-webhook-sunset.ts": "transport",
  "src/lib/protocol/transport/notice-transmit.ts": "transport",
  "src/lib/protocol/transport/peer-discovery.ts": "transport",
  "src/lib/protocol/transport/peer-mesh.ts": "transport",
  "src/lib/protocol/transport/peer-protocol-policy.ts": "transport",
  "src/lib/protocol/transport/peers-migrate-legacy.ts": "transport",
  "src/lib/protocol/transport/peers.ts": "transport",
  "src/lib/protocol/transport/pre-deliver-gate.ts": "transport",
  "src/lib/protocol/transport/protocol-api-config.ts": "transport",
  "src/lib/protocol/transport/protocol-api-server.ts": "transport",
  "src/lib/protocol/transport/protocol-http-client.ts": "transport",
  "src/lib/protocol/transport/protocol-tls.ts": "transport",
  "src/lib/protocol/transport/relay-sla-alert.ts": "transport",
  "src/lib/protocol/transport/relay-state.ts": "transport",
  "src/lib/protocol/transport/resilience-sla.ts": "transport",
  "src/lib/protocol/transport/tls-pki.ts": "transport",
  "src/lib/protocol/transport/transaction-orphans.ts": "transport",
  "src/lib/protocol/transport/transport.ts": "transport",
  "src/lib/protocol/transport/dns.ts": "transport",
  "src/lib/protocol/transport/inbound.ts": "transport",
  "src/lib/protocol/transport/relay.ts": "transport",
  "src/lib/protocol/transport/types.ts": "transport",
  "src/lib/protocol/transport/codec.ts": "transport",
  "src/lib/protocol/transport/openorg-dns.ts": "transport",
  "src/lib/protocol/transport/gov-gateway-port.ts": "transport",
  "src/lib/protocol/transport/wire-dead-letter-audit.ts": "transport",
  "src/lib/protocol/transport/wire-delivered.ts": "transport",
  "src/lib/protocol/transport/wire-pending-lifecycle.ts": "transport",
  "src/lib/protocol/transport/wire-pending-retry.ts": "transport",
  "src/lib/protocol/transport/wire-queue.ts": "transport",
  "src/lib/protocol/transport/yaml-pending-queue.ts": "transport",

  // distribution
  "src/lib/protocol/distribution/contract-witness-pool.ts": "distribution",
  "src/lib/protocol/distribution/org-cert-witness.ts": "distribution",
  "src/lib/protocol/distribution/reconcile-alerts-store.ts": "distribution",
  "src/lib/protocol/distribution/registry.ts": "distribution",
  "src/lib/protocol/distribution/relay-worker.ts": "distribution",
  "src/lib/protocol/distribution/trusted-hubs-sync.ts": "distribution",
  "src/lib/protocol/distribution/trusted-hubs.ts": "distribution",
  "src/lib/protocol/distribution/trusted-operators.ts": "distribution",
  "src/lib/protocol/distribution/wire-node-governance-gate.ts": "distribution",
  "src/lib/protocol/distribution/wire-node-governance.ts": "distribution",
  "src/lib/protocol/distribution/wire-relay-store.ts": "distribution",
  "src/lib/protocol/distribution/wire-trust-registry-sync.ts": "distribution",
  "src/lib/protocol/distribution/wire-trust-registry.ts": "distribution",
  "src/lib/protocol/distribution/witness-attestation-build.ts": "distribution",
  "src/lib/protocol/distribution/witness-attestation-crypto.ts": "distribution",
  "src/lib/protocol/distribution/witness-client.ts": "distribution",
  "src/lib/protocol/distribution/witness-envelope-emit.ts": "distribution",
  "src/lib/protocol/distribution/witness-hook.ts": "distribution",
  "src/lib/protocol/distribution/witness-pending-lifecycle.ts": "distribution",
  "src/lib/protocol/distribution/witness-policy.ts": "distribution",
  "src/lib/protocol/distribution/witness-pool-init.ts": "distribution",
  "src/lib/protocol/distribution/witness-pool-persist.ts": "distribution",
  "src/lib/protocol/distribution/witness-pool.ts": "distribution",
  "src/lib/protocol/distribution/witness-queue.ts": "distribution",
  "src/lib/protocol/distribution/witness-quorum.ts": "distribution",
  "src/lib/protocol/distribution/witness-reconcile.ts": "distribution",
  "src/lib/protocol/distribution/witness-trust.ts": "distribution",

  // adapters
  "src/lib/protocol/adapters/community-connector-bind.ts": "adapters",
  "src/lib/protocol/adapters/community-connectors-api.ts": "adapters",
  "src/lib/protocol/adapters/community-export.ts": "adapters",
  "src/lib/protocol/adapters/community-gmail-bind.ts": "adapters",
  "src/lib/protocol/adapters/community-integration-flags.ts": "adapters",
  "src/lib/protocol/adapters/community-tenant-mail-api.ts": "adapters",
  "src/lib/protocol/adapters/community-wire-node-api.ts": "adapters",
  "src/lib/protocol/adapters/email-wire-deliver.ts": "adapters",
  "src/lib/protocol/adapters/email-wire-ingest.ts": "adapters",
  "src/lib/protocol/adapters/map-internal.ts": "adapters",
  "src/lib/protocol/adapters/webhook-bridge.ts": "adapters",

  // readiness (score / gates / evidence — commands may import; domain layers must not)
  "src/lib/protocol/readiness/community-readiness.ts": "readiness",
  "src/lib/protocol/readiness/eco-production-evidence.ts": "readiness",
  "src/lib/protocol/readiness/openorgos-core-readiness.ts": "readiness",
  "src/lib/protocol/readiness/orgos-readiness-strict.ts": "readiness",
  "src/lib/protocol/readiness/orgos-readiness.ts": "readiness",
  "src/lib/protocol/readiness/prod-wire-gate.ts": "readiness",
  "src/lib/protocol/readiness/standalone-production-evidence.ts": "readiness",
  "src/lib/protocol/readiness/test-suite-status.ts": "readiness",
  "src/lib/protocol/readiness/wire-implementation-score.ts": "readiness",
  "src/lib/protocol/readiness/wire-live-verify.ts": "readiness",
  "src/lib/protocol/readiness/wire-production-evidence.ts": "readiness",
};

const META_FILES = new Set([
  "src/lib/protocol/index.ts",
  "src/lib/protocol/compatibility.ts",
  "src/lib/protocol/layer-catalog.ts",
  "src/lib/protocol/layer-dependency-scan.ts",
  "src/lib/protocol/layer-violation-baseline.ts",
  "src/lib/protocol/mailparser.d.ts",
  "src/lib/protocol/core/index.ts",
  "src/lib/protocol/transport/index.ts",
  "src/lib/protocol/distribution/index.ts",
  "src/lib/protocol/adapters/index.ts",
  "src/lib/protocol/readiness/index.ts",
]);

export function resolveProtocolFileLayer(repoRelativePath: string): ProtocolLayer | null {
  const normalized = repoRelativePath.replace(/\\/g, "/");
  if (META_FILES.has(normalized)) return null;
  return PROTOCOL_FILE_LAYER[normalized] ?? null;
}

function listProtocolTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      listProtocolTsFiles(abs, out);
      continue;
    }
    if (entry.name.endsWith(".ts")) {
      out.push(relative(ROOT_DIR, abs).replace(/\\/g, "/"));
    }
  }
  return out;
}

export function listUnassignedProtocolModules(): string[] {
  const root = join(ROOT_DIR, "src/lib/protocol");
  return listProtocolTsFiles(root)
    .filter((p) => !META_FILES.has(p))
    .filter((p) => !(p in PROTOCOL_FILE_LAYER))
    .filter((p) => {
      // Compatibility shims at the flat protocol root are assigned via their targets.
      const abs = join(ROOT_DIR, p);
      if (!existsSync(abs)) return true;
      const text = readFileSync(abs, "utf-8");
      return !/Compatibility shim/.test(text);
    })
    .sort();
}

export function validateProtocolLayerCatalog(): string[] {
  const issues: string[] = [];
  for (const entry of PROTOCOL_LAYER_MODULES) {
    const abs = join(ROOT_DIR, entry.path);
    if (!existsSync(abs)) {
      issues.push(`missing ${entry.layer} module: ${entry.path}`);
    }
  }

  const transportIndex = join(ROOT_DIR, "src/lib/protocol/transport/index.ts");
  if (existsSync(transportIndex)) {
    const text = readFileSync(transportIndex, "utf-8");
    if (!text.includes("./types.js") || !text.includes("./dns.js")) {
      issues.push("transport/index.ts must export staged transport submodules");
    }
  }

  for (const missing of listUnassignedProtocolModules()) {
    issues.push(`unassigned protocol module: ${missing}`);
  }

  for (const [path, layer] of Object.entries(PROTOCOL_FILE_LAYER)) {
    if (!existsSync(join(ROOT_DIR, path))) {
      issues.push(`catalog path missing (${layer}): ${path}`);
    }
  }

  return issues;
}
