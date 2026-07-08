import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../lib/tenant.js";
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
import type { WireGatewayConfig } from "../../schemas/protocol/wire-gateway-config.js";

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
    process.exitCode = 1;
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

export interface WireInternalApiServeOptions {
  tenant?: string;
  host?: string;
  port?: number;
  bearerToken?: string;
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
