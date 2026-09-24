import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface DevServerTlsMaterial {
  dir: string;
  caCertPath: string;
  caKeyPath: string;
  serverCertPath: string;
  serverKeyPath: string;
}

function runOpenSsl(args: string[]): void {
  execFileSync("openssl", args, { stdio: "pipe" });
}

function issueServerCert(opts: {
  caCert: string;
  caKey: string;
  keyOut: string;
  certOut: string;
  commonName: string;
  dnsNames: string[];
}): void {
  const csr = `${opts.certOut}.csr`;
  const cnf = `${opts.certOut}.cnf`;
  const san = opts.dnsNames.map((d) => `DNS:${d}`).join(",");
  writeFileSync(
    cnf,
    `[req]
distinguished_name=dn
req_extensions=ext
prompt=no
[dn]
CN=${opts.commonName}
[ext]
subjectAltName=${san}
`,
    "utf-8"
  );
  runOpenSsl(["genrsa", "-out", opts.keyOut, "2048"]);
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
}

/** Dev/staging server TLS (CA + server cert). Never commit private keys to git. */
export function ensureDevServerTls(opts: {
  outputDir: string;
  commonName?: string;
  dnsNames?: string[];
  force?: boolean;
}): DevServerTlsMaterial {
  const dir = opts.outputDir;
  mkdirSync(dir, { recursive: true });

  const caCertPath = join(dir, "ca.pem");
  const caKeyPath = join(dir, "ca.key");
  const serverCertPath = join(dir, "server.pem");
  const serverKeyPath = join(dir, "server.key");
  const dnsNames = opts.dnsNames ?? ["localhost", "127.0.0.1"];
  const commonName = opts.commonName ?? dnsNames[0] ?? "localhost";

  const allExist =
    existsSync(caCertPath) &&
    existsSync(caKeyPath) &&
    existsSync(serverCertPath) &&
    existsSync(serverKeyPath);

  if (!allExist || opts.force) {
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
      "/CN=OrgOS Dev Server CA",
    ]);
    issueServerCert({
      caCert: caCertPath,
      caKey: caKeyPath,
      keyOut: serverKeyPath,
      certOut: serverCertPath,
      commonName,
      dnsNames,
    });
  }

  return { dir, caCertPath, caKeyPath, serverCertPath, serverKeyPath };
}
