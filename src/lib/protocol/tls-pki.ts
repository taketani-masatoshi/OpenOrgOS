import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getWorkspaceRoot, getDeployDir } from "../orgos-paths.js";
import { getProtocolDataDir } from "./paths.js";
import { writeProtocolApiClientConfig } from "./protocol-api-config.js";
import { setTenantId } from "../tenant.js";

export function getProposal3PkiDir(): string {
  return join(getWorkspaceRoot(), "data", "proposal3-pki");
}

export interface Proposal3PkiMaterial {
  dir: string;
  caCertPath: string;
  caKeyPath: string;
  serverCertPath: string;
  serverKeyPath: string;
  clientCerts: Record<
    string,
    { orgUri: string; certPath: string; keyPath: string }
  >;
}

function runOpenSsl(args: string[]): void {
  execFileSync("openssl", args, { stdio: "pipe" });
}

function issueCert(opts: {
  caCert: string;
  caKey: string;
  keyOut: string;
  certOut: string;
  subject: string;
  sanUri?: string;
}): void {
  const csr = `${opts.certOut}.csr`;
  runOpenSsl(["genrsa", "-out", opts.keyOut, "2048"]);

  if (opts.sanUri) {
    const cnf = `${opts.certOut}.cnf`;
    writeFileSync(
      cnf,
      `[req]
distinguished_name=dn
req_extensions=ext
prompt=no
[dn]
CN=${opts.subject}
[ext]
subjectAltName=URI:${opts.sanUri}
`,
      "utf-8"
    );
    runOpenSsl(["req", "-new", "-key", opts.keyOut, "-out", csr, "-config", cnf]);
    runOpenSsl([
      "x509",
      "-req",
      "-in",
      csr,
      "-CA",
      opts.caCert,
      "-CAkey",
      opts.caKey,
      "-CAcreateserial",
      "-out",
      opts.certOut,
      "-days",
      "825",
      "-extensions",
      "ext",
      "-extfile",
      cnf,
    ]);
    return;
  }

  runOpenSsl(["req", "-new", "-key", opts.keyOut, "-out", csr, "-subj", `/CN=${opts.subject}`]);
  runOpenSsl([
    "x509",
    "-req",
    "-in",
    csr,
    "-CA",
    opts.caCert,
    "-CAkey",
    opts.caKey,
    "-CAcreateserial",
    "-out",
    opts.certOut,
    "-days",
    "825",
  ]);
}

export function ensureProposal3Pki(opts?: {
  clients?: string[];
  force?: boolean;
  outputDir?: string;
}): Proposal3PkiMaterial {
  const clients = opts?.clients ?? ["mal", "southwood"];
  const dir = opts?.outputDir ?? getProposal3PkiDir();
  mkdirSync(join(dir, "clients"), { recursive: true });

  const caCertPath = join(dir, "ca.pem");
  const caKeyPath = join(dir, "ca.key");
  const serverCertPath = join(dir, "server.pem");
  const serverKeyPath = join(dir, "server.key");

  const allExist =
    existsSync(caCertPath) &&
    existsSync(serverCertPath) &&
    clients.every((c) => existsSync(join(dir, "clients", `${c}-client.pem`)));

  if (!allExist || opts?.force) {
    runOpenSsl(["genrsa", "-out", caKeyPath, "2048"]);
    runOpenSsl([
      "req",
      "-x509",
      "-new",
      "-nodes",
      "-key",
      caKeyPath,
      "-days",
      "825",
      "-out",
      caCertPath,
      "-subj",
      "/CN=OrgOS Proposal3 Dev CA",
    ]);
    issueCert({
      caCert: caCertPath,
      caKey: caKeyPath,
      keyOut: serverKeyPath,
      certOut: serverCertPath,
      subject: "localhost",
    });
  }

  const clientCerts: Proposal3PkiMaterial["clientCerts"] = {};
  for (const tenantId of clients) {
    const orgUri = `steward://tenant/${tenantId}`;
    const certPath = join(dir, "clients", `${tenantId}-client.pem`);
    const keyPath = join(dir, "clients", `${tenantId}-client.key`);
    if (!existsSync(certPath) || opts?.force) {
      issueCert({
        caCert: caCertPath,
        caKey: caKeyPath,
        keyOut: keyPath,
        certOut: certPath,
        subject: orgUri,
        sanUri: orgUri,
      });
    }
    clientCerts[tenantId] = { orgUri, certPath, keyPath };
  }

  return {
    dir,
    caCertPath,
    caKeyPath,
    serverCertPath,
    serverKeyPath,
    clientCerts,
  };
}

export function writePartyProtocolClientConfig(
  tenantId: string,
  pki: Proposal3PkiMaterial,
  opts?: { relayOrgUri?: string }
): void {
  setTenantId(tenantId);
  const client = pki.clientCerts[tenantId];
  if (!client) {
    throw new Error(`No client cert for tenant ${tenantId}`);
  }
  writeProtocolApiClientConfig({
    tls: {
      cert_path: client.certPath,
      key_path: client.keyPath,
      ca_path: pki.caCertPath,
      reject_unauthorized: false,
    },
    allowed_relay_org_uris: opts?.relayOrgUri ? [opts.relayOrgUri] : undefined,
  });
}

export function writeOrgCServerTlsMetadata(orgCTenantId: string, pki: Proposal3PkiMaterial): string {
  setTenantId(orgCTenantId);
  const tlsDir = join(getProtocolDataDir(), "tls");
  mkdirSync(tlsDir, { recursive: true });
  const metaPath = join(tlsDir, "org-c-api.json");
  writeFileSync(
    metaPath,
    JSON.stringify(
      {
        ca_path: pki.caCertPath,
        server_cert_path: pki.serverCertPath,
        server_key_path: pki.serverKeyPath,
        mtls_allowed_org_uris: Object.values(pki.clientCerts).map((c) => c.orgUri),
      },
      null,
      2
    ),
    "utf-8"
  );
  return metaPath;
}

export function loadOrgCServerTlsMetadata(orgCTenantId: string): {
  ca_path: string;
  server_cert_path: string;
  server_key_path: string;
  mtls_allowed_org_uris: string[];
} {
  setTenantId(orgCTenantId);
  const metaPath = join(getProtocolDataDir(), "tls", "org-c-api.json");
  if (!existsSync(metaPath)) {
    throw new Error(
      `Org C TLS metadata missing — run: npm run proposal3:tls-init (tenant ${orgCTenantId})`
    );
  }
  return JSON.parse(readFileSync(metaPath, "utf-8")) as {
    ca_path: string;
    server_cert_path: string;
    server_key_path: string;
    mtls_allowed_org_uris: string[];
  };
}

export function proposal3OrgCApiEnv(orgCTenantId: string, pki: Proposal3PkiMaterial): Record<string, string> {
  return {
    ORGOS_TENANT: orgCTenantId,
    PROTOCOL_API_HOST: "127.0.0.1",
    PROTOCOL_API_PORT: String(process.env.DEMO_ORG_C_API_PORT ?? 9486),
    PROTOCOL_TLS_CERT: pki.serverCertPath,
    PROTOCOL_TLS_KEY: pki.serverKeyPath,
    PROTOCOL_TLS_CA: pki.caCertPath,
    PROTOCOL_MTLS_REQUIRED: "1",
    PROTOCOL_MTLS_ALLOWED_ORGS: Object.values(pki.clientCerts)
      .map((c) => c.orgUri)
      .join(","),
  };
}

export function writeProposal3DeployEnv(orgCTenantId: string, pki: Proposal3PkiMaterial): string {
  const envDir = join(getDeployDir(), "proposal3", "env");
  mkdirSync(envDir, { recursive: true });
  const envPath = join(envDir, "org-c-api.generated.env");
  const lines = Object.entries(proposal3OrgCApiEnv(orgCTenantId, pki)).map(
    ([k, v]) => `${k}=${v}`
  );
  writeFileSync(envPath, `${lines.join("\n")}\n`, "utf-8");

  for (const tenantId of Object.keys(pki.clientCerts)) {
    const partyPath = join(envDir, `party-relay-${tenantId}.generated.env`);
    writeFileSync(
      partyPath,
      `ORGOS_TENANT=${tenantId}\nRELAY_INTERVAL_SEC=30\n`,
      "utf-8"
    );
  }

  return envPath;
}
