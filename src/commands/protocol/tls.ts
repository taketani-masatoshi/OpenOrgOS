/** Protocol TLS / Proposal 3 command handlers. */
import { loadTenantConfig } from "../../lib/tenant.js";
import { applyProtocolTenant } from "./shared.js";
import {
  ensureProposal3Pki,
  writeOrgCServerTlsMetadata,
  writePartyProtocolClientConfig,
  writeProposal3DeployEnv,
} from "../../lib/protocol/transport/tls-pki.js";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getProtocolDataDir } from "../../lib/protocol/core/paths.js";
import { readFileSync } from "node:fs";


export interface ProtocolTlsRotateOptions {
  tenant?: string;
  certPath?: string;
  keyPath?: string;
  json?: boolean;
}

export interface ProtocolTlsInitProposal3Options {
  orgCTenant?: string;
  clients?: string[];
  force?: boolean;
  json?: boolean;
}

export function runProtocolTlsInitProposal3(opts: ProtocolTlsInitProposal3Options): void {
  const orgC = opts.orgCTenant ?? "aiac";
  const clients = opts.clients ?? ["mal", "southwood"];
  const pki = ensureProposal3Pki({ clients, force: opts.force });
  writeOrgCServerTlsMetadata(orgC, pki);
  writeProposal3DeployEnv(orgC, pki);
  for (const tenantId of clients) {
    writePartyProtocolClientConfig(tenantId, pki, { relayOrgUri: `steward://tenant/${orgC}` });
  }

  const summary = {
    pki_dir: pki.dir,
    org_c_tenant: orgC,
    clients,
    bundle_origin: `https://127.0.0.1:${process.env.DEMO_ORG_C_API_PORT ?? 9486}`,
    deploy_env: "deploy/proposal3/env/org-c-api.generated.env",
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`✓ Proposal 3 PKI · ${pki.dir}`);
  console.log(`  Org C (${orgC}) server TLS metadata · deploy env written`);
  for (const tenantId of clients) {
    console.log(`  client config · ${tenantId}/data/protocol/protocol-api-client.yaml`);
  }
  console.log(`  Next: npm run proposal3:org-c-api · npm run proposal3:party-relay -- mal`);
}

export function runProtocolTlsRotate(opts: ProtocolTlsRotateOptions): void {
  applyProtocolTenant(opts.tenant);
  const tlsDir = join(getProtocolDataDir(), "tls");
  mkdirSync(tlsDir, { recursive: true });
  const orgCMetaPath = join(tlsDir, "org-c-api.json");
  const orgCMeta = existsSync(orgCMetaPath)
    ? (JSON.parse(readFileSync(orgCMetaPath, "utf-8")) as {
        server_cert_path: string;
        server_key_path: string;
        ca_path: string;
      })
    : undefined;
  const clientConfigPath = join(getProtocolDataDir(), "protocol-api-client.yaml");
  const certPath = opts.certPath ?? orgCMeta?.server_cert_path ?? join(tlsDir, "server.crt");
  const keyPath = opts.keyPath ?? orgCMeta?.server_key_path ?? join(tlsDir, "server.key");
  const checklist = [
    "1. Issue new X.509 material (internal CA / ACME) — never commit private keys",
    ...(orgCMeta
      ? [
          `2. Org C server: replace ${orgCMeta.server_cert_path} + ${orgCMeta.server_key_path}`,
          "3. Org C: systemctl restart steward-org-c-api OR npm run proposal3:org-c-api",
        ]
      : [
          `2. Server (if applicable): replace ${certPath} + ${keyPath}`,
          "3. Server: restart protocol api-serve / proposal3:org-c-api",
        ]),
    ...(existsSync(clientConfigPath)
      ? [
          `4. Party client: update ${clientConfigPath} (cert_path · key_path · ca_path)`,
          "5. Party: restart relay · npm run proposal3:party-relay OR launchctl",
        ]
      : ["4. Party: write protocol-api-client.yaml from steward/platform/protocol/protocol-api-client.yaml.example"]),
    "6. Verify trust bundle: npm run orgos -- protocol tls verify",
    "7. Verify daemons: npm run proposal3:daemon-smoke",
    "8. Re-pin contracts if bundle origin changed (witness_trust_bundle_url)",
  ];
  const meta = {
    rotated_at: new Date().toISOString(),
    tenant: loadTenantConfig().id,
    cert_path: certPath,
    key_path: keyPath,
    org_c_metadata: orgCMetaPath,
    client_config: existsSync(clientConfigPath) ? clientConfigPath : undefined,
    checklist,
    previous_cert_exists: existsSync(certPath),
    previous_key_exists: existsSync(keyPath),
    dev_regenerate: "npm run proposal3:tls-init -- --force (dev only)",
  };
  writeFileSync(join(tlsDir, "rotation-meta.json"), JSON.stringify(meta, null, 2));
  if (opts.json) {
    console.log(JSON.stringify(meta, null, 2));
    return;
  }
  console.log(`✓ TLS rotation checklist · ${join(tlsDir, "rotation-meta.json")}`);
  for (const step of checklist) console.log(`  · ${step}`);
}

export interface ProtocolTlsVerifyOptions {
  tenant?: string;
  url?: string;
  json?: boolean;
}

export async function runProtocolTlsVerify(opts: ProtocolTlsVerifyOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { loadProtocolApiClientConfig } = await import("../../lib/protocol/transport/protocol-api-config.js");
  const { protocolFetch } = await import("../../lib/protocol/transport/protocol-tls.js");
  const { loadContracts } = await import("../../lib/data.js");

  let bundleUrl =
    opts.url ??
    process.env.ORG_C_BUNDLE_URL ??
    loadContracts().find((c) => c.protocol?.witness_trust_bundle_url)?.protocol
      ?.witness_trust_bundle_url;

  if (!bundleUrl) {
    const port = process.env.DEMO_ORG_C_API_PORT ?? "9486";
    bundleUrl = `https://127.0.0.1:${port}/protocol/v1/trust/bundle`;
  }

  const client = loadProtocolApiClientConfig();
  const caPath = client.tls?.ca_path;
  if (!bundleUrl.startsWith("https://")) {
    console.error("TLS verify expects https:// bundle URL");
    process.exit(1);
  }
  if (!caPath && !client.tls?.cert_path) {
    console.error("Missing protocol-api-client.yaml tls.ca_path — run proposal3:tls-init");
    process.exit(1);
  }

  const tls = client.tls ?? { ca_path: caPath!, reject_unauthorized: false };
  const bundleRes = await protocolFetch(bundleUrl, { tls: { ca_path: tls.ca_path, reject_unauthorized: tls.reject_unauthorized ?? false } });
  const report: Record<string, unknown> = {
    bundle_url: bundleUrl,
    bundle_ok: bundleRes.ok,
    bundle_status: bundleRes.status,
  };

  if (client.tls?.cert_path && client.tls?.key_path) {
    const origin = new URL(bundleUrl).origin;
    const metricsRes = await protocolFetch(`${origin}/protocol/v1/metrics`, { tls: client.tls });
    report.metrics_ok = metricsRes.ok;
    report.metrics_status = metricsRes.status;
    report.mtls = metricsRes.ok;
  } else {
    report.mtls = "skipped (no client cert in protocol-api-client.yaml)";
  }

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    if (!bundleRes.ok) process.exit(1);
    return;
  }
  console.log(`✓ TLS verify · bundle ${bundleRes.status} · ${bundleUrl}`);
  if (client.tls?.cert_path) {
    console.log(`  mTLS metrics: ${report.metrics_ok ? "OK" : "FAIL"} (${report.metrics_status})`);
    if (!report.metrics_ok) process.exit(1);
  }
  if (!bundleRes.ok) process.exit(1);
}

