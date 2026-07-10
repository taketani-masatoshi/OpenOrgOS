import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getTenantId } from "../lib/tenant.js";
import {
  loadWireGatewayConfig,
  validateWireGatewayConfig,
  getWireGatewayYamlPath,
} from "../lib/wire-gateway/validate.js";
import {
  startWireGatewayServer,
  startWireInternalApiServer,
} from "../lib/wire-gateway/index.js";
import { ensureDevServerTls } from "../lib/protocol/dev-server-tls.js";
import { getDeployDir } from "../lib/orgos-paths.js";
import { writeYamlFile } from "../lib/utils.js";
import { requireCliConfigWrite } from "../lib/console-auth/cli-operator.js";
import { ensureProtocolSigningKey, exportProtocolPublicKeyBase64 } from "../lib/protocol/signing.js";
import { resolveWireGatewayDid } from "../lib/wire-gateway/did.js";
import { loadWireTrustRegistry } from "../lib/protocol/wire-trust-registry.js";
import {
  listWireGatewayDiscoverEntries,
  listWireGatewayFederationCatalog,
  listWireGatewayPeerSuggestions,
  applyWireGatewayDiscover,
  syncWireGatewayFederation,
} from "../lib/wire-gateway/discover.js";
import type { WireGatewayConfig } from "../../schemas/protocol/wire-gateway-config.js";
import { wireGatewayConfigSchema } from "../../schemas/protocol/wire-gateway-config.js";

export interface WireGatewayValidateOptions {
  tenant?: string;
  json?: boolean;
}

export function runWireGatewayValidate(opts: WireGatewayValidateOptions = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const config = loadWireGatewayConfig();
  const result = validateWireGatewayConfig(config);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }
  if (result.ok) {
    console.log("✓ wire-gateway config valid");
    for (const w of result.warnings) {
      console.log(`  [warn] [${w.code}] ${w.message}`);
    }
  } else {
    for (const issue of result.issues) {
      console.log(`✗ [${issue.code}] ${issue.message}`);
    }
    for (const w of result.warnings) {
      console.log(`  [warn] [${w.code}] ${w.message}`);
    }
    process.exit(1);
  }
}

export interface WireGatewayServeOptions {
  tenant?: string;
  host?: string;
  port?: number;
  publicBaseUrl?: string;
  tlsCert?: string;
  tlsKey?: string;
  noOutbound?: boolean;
  config?: WireGatewayConfig;
}

export async function runWireGatewayServe(opts: WireGatewayServeOptions = {}): Promise<void> {
  if (opts.tenant) setTenantId(opts.tenant);
  const config = opts.config ?? loadWireGatewayConfig();
  if (!config) {
    throw new Error("wire-gateway.yaml not found — copy from steward/platform/protocol/seed/wire-gateway.yaml.example");
  }
  const validation = validateWireGatewayConfig(config);
  if (!validation.ok) {
    throw new Error(validation.issues.map((i) => i.message).join("; "));
  }

  if (opts.host) config.listen.host = opts.host;
  if (opts.port) config.listen.port = opts.port;
  if (opts.tlsCert) config.listen.tls_cert = opts.tlsCert;
  if (opts.tlsKey) config.listen.tls_key = opts.tlsKey;

  const server = await startWireGatewayServer({
    config,
    publicBaseUrl: opts.publicBaseUrl,
    enableOutbound: !opts.noOutbound,
  });

  console.log(`✓ Wire Gateway ${server.url}`);
  console.log(`  health: ${server.url}/wire/v1/health`);
  console.log(`  well-known: ${server.url}/.well-known/wire-node.json`);

  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => resolve());
    process.on("SIGTERM", () => resolve());
  });
  server.close();
}

export interface WireGatewayTlsInitOptions {
  tenant?: string;
  outputDir?: string;
  force?: boolean;
  json?: boolean;
}

export function runWireGatewayTlsInit(opts: WireGatewayTlsInitOptions = {}): void {
  requireCliConfigWrite("wire-gateway tls-init");
  if (opts.tenant) setTenantId(opts.tenant);
  const tlsDir =
    opts.outputDir ?? join(getDeployDir(), "wire-gateway", "tls");
  const pki = ensureDevServerTls({
    outputDir: tlsDir,
    commonName: "wire-gateway.local",
    dnsNames: ["localhost", "127.0.0.1", "wire-gateway.local"],
    force: opts.force,
  });

  const configPath = getWireGatewayYamlPath();
  let config = loadWireGatewayConfig();
  if (!config) {
    const seed = join(getDeployDir(), "wire-gateway", "config", "wire-gateway.yaml");
    if (!existsSync(seed)) {
      throw new Error(`Seed config missing: ${seed}`);
    }
    mkdirSync(join(configPath, ".."), { recursive: true });
    copyFileSync(seed, configPath);
    config = loadWireGatewayConfig();
  }
  if (!config) {
    throw new Error("Failed to load wire-gateway.yaml after seed copy");
  }

  config.listen.tls_cert = pki.serverCertPath;
  config.listen.tls_key = pki.serverKeyPath;
  writeYamlFile(configPath, config);

  const summary = {
    tls_dir: pki.dir,
    ca_cert: pki.caCertPath,
    server_cert: pki.serverCertPath,
    server_key: pki.serverKeyPath,
    config_path: configPath,
    compose: "docker compose -f docker-compose.yaml -f docker-compose.tls.yaml up",
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`✓ Wire Gateway dev TLS · ${pki.dir}`);
  console.log(`  config: ${configPath} (listen.tls_cert / tls_key updated)`);
  console.log(`  Next: cd deploy/wire-gateway && ${summary.compose}`);
}

export interface WireGatewayDidShowOptions {
  tenant?: string;
  json?: boolean;
}

export function runWireGatewayDidShow(opts: WireGatewayDidShowOptions = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);
  ensureProtocolSigningKey();
  const config = loadWireGatewayConfig();
  const publicKey = exportProtocolPublicKeyBase64();
  const did = resolveWireGatewayDid(config ?? undefined);
  const registry = loadWireTrustRegistry();
  const summary = {
    did,
    node_id: config?.node_id,
    node_uri: config?.node_uri,
    protocol_public_key: publicKey,
    trust_registry_url: config?.trust_registry_url ?? registry.publish_url,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`did: ${did ?? "(unavailable — run wire-gateway did init)"}`);
  if (config?.node_id) console.log(`node_id: ${config.node_id}`);
  if (publicKey) console.log(`protocol_public_key: ${publicKey.slice(0, 16)}…`);
}

export interface WireGatewayDidInitOptions {
  tenant?: string;
  force?: boolean;
  json?: boolean;
}

export function runWireGatewayDidInit(opts: WireGatewayDidInitOptions = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);
  requireCliConfigWrite();
  ensureProtocolSigningKey();
  const publicKey = exportProtocolPublicKeyBase64();
  if (!publicKey) {
    throw new Error("signing key unavailable");
  }

  const configPath = getWireGatewayYamlPath();
  let config = loadWireGatewayConfig();
  if (!config) {
    const seed = join(getDeployDir(), "wire-gateway", "config", "wire-gateway.yaml");
    if (!existsSync(seed)) {
      throw new Error(`Seed config missing: ${seed}`);
    }
    mkdirSync(join(configPath, ".."), { recursive: true });
    copyFileSync(seed, configPath);
    config = loadWireGatewayConfig();
  }
  if (!config) {
    throw new Error("Failed to load wire-gateway.yaml");
  }
  if (config.did && !opts.force) {
    throw new Error(`did already set (${config.did}) — use --force`);
  }

  const did = resolveWireGatewayDid(config);
  if (!did) {
    throw new Error("Could not derive DID");
  }
  config.did = did;
  if (!config.trust_registry_url) {
    config.trust_registry_url = loadWireTrustRegistry().publish_url;
  }
  writeYamlFile(configPath, config);

  const summary = { did, config_path: configPath, protocol_public_key: publicKey };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`✓ Wire Gateway DID · ${did}`);
  console.log(`  config: ${configPath}`);
}

export interface WireGatewayInitOptions {
  tenant?: string;
  force?: boolean;
  json?: boolean;
}

function resolveTrustRegistryNode(tenantId: string) {
  const registry = loadWireTrustRegistry();
  return registry.nodes.find(
    (n) => n.node_uri === `steward://tenant/${tenantId}` || n.node_id === tenantId
  );
}

export function runWireGatewayInit(opts: WireGatewayInitOptions = {}): void {
  requireCliConfigWrite("wire-gateway init");
  if (opts.tenant) setTenantId(opts.tenant);
  const tenantId = getTenantId();
  const configPath = getWireGatewayYamlPath();
  if (existsSync(configPath) && !opts.force) {
    throw new Error(`wire-gateway.yaml already exists at ${configPath} (use --force)`);
  }

  const node = resolveTrustRegistryNode(tenantId);
  const registry = loadWireTrustRegistry();
  const config = wireGatewayConfigSchema.parse({
    wire_version: "0.1",
    node_id: node?.node_id ?? tenantId,
    node_uri: node?.node_uri ?? `steward://tenant/${tenantId}`,
    display_name: node?.display_name ?? tenantId,
    did: node?.did,
    trust_registry_url: registry.publish_url,
    listen: { host: "0.0.0.0", port: 8443 },
    internal_api: {
      base_url: "http://127.0.0.1:8080/internal/v1/wire",
      bearer_token: `${tenantId}-pilot-internal-dev`,
    },
    security: {
      timestamp_skew_sec: 300,
      nonce_ttl_sec: 604800,
      rate_limit_per_min: 120,
    },
    outbound: { poll_interval_ms: 5000 },
    audit: { path: "data/protocol/wire-gateway-audit.jsonl" },
    legacy: { enabled: false },
  });

  mkdirSync(join(configPath, ".."), { recursive: true });
  writeYamlFile(configPath, config);

  const summary = { tenant: tenantId, config_path: configPath, node_id: config.node_id, did: config.did };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`✓ Wire Gateway init · tenant=${tenantId}`);
  console.log(`  config: ${configPath}`);
  if (config.did) console.log(`  did: ${config.did}`);
  console.log(`  Next: orgos wire-gateway validate --tenant ${tenantId}`);
}

export interface WireInternalApiServeOptions {
  tenant?: string;
  host?: string;
  port?: number;
  bearerToken?: string;
}

export interface WireGatewayDiscoverOptions {
  tenant?: string;
  jurisdiction?: string;
  json?: boolean;
  suggest?: boolean;
}

export function runWireGatewayDiscover(opts: WireGatewayDiscoverOptions = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const tenantId = getTenantId();
  const jurisdiction = opts.jurisdiction;

  if (opts.suggest) {
    const suggestions = listWireGatewayPeerSuggestions({ tenantId, jurisdiction });
    if (opts.json) {
      console.log(JSON.stringify({ tenant: tenantId, jurisdiction, count: suggestions.length, suggestions }, null, 2));
      return;
    }
    console.log(`Wire peer suggestions (${tenantId}): ${suggestions.length}`);
    for (const s of suggestions) {
      console.log(`  · ${s.entry.node_id}: ${s.register_command}`);
    }
    return;
  }

  const entries = listWireGatewayDiscoverEntries({ tenantId, jurisdiction });
  if (opts.json) {
    console.log(JSON.stringify({ tenant: tenantId, jurisdiction, count: entries.length, entries }, null, 2));
    return;
  }
  console.log(`Wire trust-registry nodes (${tenantId}): ${entries.length}`);
  for (const entry of entries) {
    const status = entry.self ? "self" : entry.registered ? "registered" : "unregistered";
    console.log(`  · ${entry.node_id} — ${entry.display_name} [${status}]${entry.wire_url ? ` · ${entry.wire_url}` : ""}`);
  }
}

export interface WireGatewayFederationOptions {
  json?: boolean;
}

export function runWireGatewayFederationList(opts: WireGatewayFederationOptions = {}): void {
  const catalog = listWireGatewayFederationCatalog();
  if (opts.json) {
    console.log(JSON.stringify({ count: catalog.length, federation: catalog }, null, 2));
    return;
  }
  console.log(`Wire Gateway federation catalog: ${catalog.length} node(s)`);
  for (const node of catalog) {
    const pin = node.protocol_public_key_pinned ? "pinned" : "unpinned";
    console.log(`  · ${node.node_id} — ${node.display_name} [${pin}]${node.wire_url ? ` · ${node.wire_url}` : ""}`);
  }
}

export interface WireGatewayDiscoverApplyOptions {
  tenant?: string;
  jurisdiction?: string;
  dryRun?: boolean;
  nodeId?: string[];
  json?: boolean;
}

export function runWireGatewayDiscoverApply(opts: WireGatewayDiscoverApplyOptions = {}): void {
  if (opts.tenant) setTenantId(opts.tenant);
  requireCliConfigWrite("wire-gateway discover --apply");
  const result = applyWireGatewayDiscover({
    tenantId: getTenantId(),
    jurisdiction: opts.jurisdiction,
    dryRun: opts.dryRun,
    nodeIds: opts.nodeId,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const mode = result.dry_run ? "dry-run" : "applied";
  console.log(`✓ wire-gateway discover ${mode} · ${result.applied.length} peer(s)`);
  for (const p of result.applied) {
    console.log(`  · ${p.peer_id} ${p.display_name} → ${p.inbound_endpoints?.[0]?.url ?? "(no endpoint)"}`);
  }
  for (const s of result.skipped) {
    console.log(`  skip ${s.node_id}: ${s.reason}`);
  }
}

export interface WireGatewayFederationSyncOptions {
  nodeId?: string;
  dryRun?: boolean;
  force?: boolean;
  json?: boolean;
}

export async function runWireGatewayFederationSync(
  opts: WireGatewayFederationSyncOptions = {}
): Promise<void> {
  const { results } = await syncWireGatewayFederation({
    nodeId: opts.nodeId,
    dryRun: opts.dryRun,
    force: opts.force,
  });
  if (opts.json) {
    console.log(JSON.stringify({ count: results.length, results }, null, 2));
    return;
  }
  console.log(`✓ wire-gateway federation sync · ${results.length} node(s)`);
  for (const r of results) {
    console.log(`  · ${r.node_id}: ${r.status}${r.detail ? ` — ${r.detail}` : ""}`);
  }
}

export async function runWireInternalApiServe(
  opts: WireInternalApiServeOptions = {}
): Promise<void> {
  if (opts.tenant) setTenantId(opts.tenant);
  const server = await startWireInternalApiServer({
    host: opts.host ?? "127.0.0.1",
    port: opts.port ?? 8080,
    bearerToken: opts.bearerToken,
    tenantId: opts.tenant,
  });

  console.log(`✓ Wire Internal API ${server.url}`);

  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => resolve());
    process.on("SIGTERM", () => resolve());
  });
  server.close();
}
