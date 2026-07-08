import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { startProtocolApiServer } from "../src/lib/protocol/protocol-api-server.js";
import { buildProtocolApiServerConfig } from "../src/lib/protocol/protocol-api-config.js";
import { protocolFetch } from "../src/lib/protocol/protocol-tls.js";

function runOpenSsl(args: string[]): void {
  execFileSync("openssl", args, { stdio: "pipe" });
}

describe("protocol API TLS / mTLS", () => {
  let tmpDir: string;
  let caPath: string;
  let serverCert: string;
  let serverKey: string;
  let clientCert: string;
  let clientKey: string;
  let closeServer: (() => void) | undefined;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "steward-protocol-tls-"));
    caPath = join(tmpDir, "ca.pem");
    const caKey = join(tmpDir, "ca.key");
    serverCert = join(tmpDir, "server.pem");
    serverKey = join(tmpDir, "server.key");
    clientCert = join(tmpDir, "client.pem");
    clientKey = join(tmpDir, "client.key");

    runOpenSsl(["genrsa", "-out", caKey, "2048"]);
    runOpenSsl([
      "req",
      "-x509",
      "-new",
      "-nodes",
      "-key",
      caKey,
      "-days",
      "1",
      "-out",
      caPath,
      "-subj",
      "/CN=Steward Test CA",
    ]);
    runOpenSsl(["genrsa", "-out", serverKey, "2048"]);
    runOpenSsl([
      "req",
      "-new",
      "-key",
      serverKey,
      "-out",
      join(tmpDir, "server.csr"),
      "-subj",
      "/CN=localhost",
    ]);
    runOpenSsl([
      "x509",
      "-req",
      "-in",
      join(tmpDir, "server.csr"),
      "-CA",
      caPath,
      "-CAkey",
      caKey,
      "-CAcreateserial",
      "-out",
      serverCert,
      "-days",
      "1",
    ]);

    runOpenSsl(["genrsa", "-out", clientKey, "2048"]);
    const clientCnf = join(tmpDir, "client.cnf");
    writeFileSync(
      clientCnf,
      `[req]
distinguished_name=dn
prompt=no
[dn]
CN=steward://tenant/mal
`,
      "utf-8"
    );
    runOpenSsl([
      "req",
      "-new",
      "-key",
      clientKey,
      "-out",
      join(tmpDir, "client.csr"),
      "-config",
      clientCnf,
    ]);
    runOpenSsl([
      "x509",
      "-req",
      "-in",
      join(tmpDir, "client.csr"),
      "-CA",
      caPath,
      "-CAkey",
      caKey,
      "-CAcreateserial",
      "-out",
      clientCert,
      "-days",
      "1",
    ]);

    writeFileSync(
      join(tmpDir, "bundle.json"),
      JSON.stringify({ version: "1", authority: { authority_id: "WTA-X" }, certificates: [] }),
      "utf-8"
    );
  });

  afterAll(() => {
    closeServer?.();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("serves trust bundle over HTTPS without client cert", async () => {
    const server = await startProtocolApiServer({
      trustBundlePath: join(tmpDir, "bundle.json"),
      config: buildProtocolApiServerConfig({
        port: 0,
        tlsCert: serverCert,
        tlsKey: serverKey,
        mtlsRequired: true,
      }),
    });
    closeServer = server.close;

    const res = await protocolFetch(`${server.url}/protocol/v1/trust/bundle`, {
      tls: { ca_path: caPath, reject_unauthorized: false },
    });
    expect(res.ok).toBe(true);
  });

  it("rejects relay enqueue without mTLS client cert", async () => {
    const server = await startProtocolApiServer({
      config: buildProtocolApiServerConfig({
        port: 0,
        tlsCert: serverCert,
        tlsKey: serverKey,
        tlsCa: caPath,
        mtlsRequired: true,
      }),
    });
    closeServer = server.close;

    const res = await protocolFetch(`${server.url}/protocol/v1/relay/enqueue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ envelope: { event_id: "00000000-0000-4000-8000-000000000001" } }),
      tls: { ca_path: caPath, reject_unauthorized: false },
    });
    expect(res.status).toBe(401);
  });

  it("accepts mTLS client on protected route when org_uri allowed", async () => {
    const server = await startProtocolApiServer({
      config: buildProtocolApiServerConfig({
        port: 0,
        tlsCert: serverCert,
        tlsKey: serverKey,
        tlsCa: caPath,
        mtlsRequired: true,
        mtlsAllowedOrgUris: ["steward://tenant/mal"],
      }),
    });
    closeServer = server.close;

    const res = await protocolFetch(`${server.url}/protocol/v1/relay/inbox`, {
      tls: {
        cert_path: clientCert,
        key_path: clientKey,
        ca_path: caPath,
        reject_unauthorized: false,
      },
    });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  });
});
