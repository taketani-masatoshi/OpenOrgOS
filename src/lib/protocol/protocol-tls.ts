import { readFileSync, existsSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import type { TLSSocket } from "node:tls";
import type { ProtocolTlsCredentials } from "../../../schemas/protocol/protocol-api-config.js";

export function loadTlsFile(path: string | undefined): Buffer | undefined {
  if (!path || !existsSync(path)) return undefined;
  return readFileSync(path);
}

export function buildTlsConnectOptions(creds: ProtocolTlsCredentials): {
  cert?: Buffer;
  key?: Buffer;
  ca?: Buffer;
  rejectUnauthorized: boolean;
} {
  const cert = creds.cert_path ? loadTlsFile(creds.cert_path) : undefined;
  const key = creds.key_path ? loadTlsFile(creds.key_path) : undefined;
  if (creds.cert_path && (!cert || !key)) {
    throw new Error(`TLS cert/key not readable: ${creds.cert_path} / ${creds.key_path}`);
  }
  if (creds.key_path && !creds.cert_path) {
    throw new Error("TLS cert_path required when key_path is set");
  }
  const ca = loadTlsFile(creds.ca_path);
  return {
    cert,
    key,
    ca,
    rejectUnauthorized: creds.reject_unauthorized ?? true,
  };
}

export async function protocolFetch(
  url: string,
  init?: RequestInit & { tls?: ProtocolTlsCredentials }
): Promise<Response> {
  if (!init?.tls) {
    return fetch(url, init);
  }

  const tlsOpts = buildTlsConnectOptions(init.tls);
  const parsed = new URL(url);
  const isHttps = parsed.protocol === "https:";
  const lib = isHttps ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const headers = init.headers as Record<string, string> | undefined;
    const req = lib(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: init.method ?? "GET",
        headers,
        cert: tlsOpts.cert,
        key: tlsOpts.key,
        ca: tlsOpts.ca,
        rejectUnauthorized: tlsOpts.rejectUnauthorized,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const responseHeaders = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (v != null) responseHeaders.set(k, Array.isArray(v) ? v.join(", ") : v);
          }
          resolve(
            new Response(body, {
              status: res.statusCode ?? 500,
              headers: responseHeaders,
            })
          );
        });
      }
    );
    req.on("error", reject);
    if (init.body) {
      req.write(typeof init.body === "string" ? init.body : init.body.toString());
    }
    req.end();
  });
}

export function extractClientOrgUriFromTlsSocket(socket: TLSSocket): string | undefined {
  const cert = socket.getPeerCertificate?.();
  if (!cert || !cert.subject) return undefined;

  const sanUri = cert.subjectaltname
    ?.split(", ")
    .find((s) => s.startsWith("URI:"))
    ?.slice(4);
  if (sanUri?.startsWith("steward://")) return sanUri;

  const subjectCn = cert.subject.CN;
  const cn = Array.isArray(subjectCn) ? subjectCn[0] : subjectCn;
  if (cn?.startsWith("steward://")) return cn;
  return cn ? `steward://tenant/${cn}` : undefined;
}

export function verifyMtlsClient(opts: {
  socket: TLSSocket;
  required: boolean;
  allowedOrgUris?: string[];
}): { ok: boolean; reason?: string; client_org_uri?: string } {
  if (!opts.required) return { ok: true };

  if (!opts.socket.authorized) {
    return {
      ok: false,
      reason: opts.socket.authorizationError
        ? String(opts.socket.authorizationError)
        : "client certificate not authorized",
    };
  }

  const clientOrgUri = extractClientOrgUriFromTlsSocket(opts.socket);
  if (opts.allowedOrgUris?.length) {
    if (!clientOrgUri || !opts.allowedOrgUris.includes(clientOrgUri)) {
      return {
        ok: false,
        reason: `client org_uri not allowed: ${clientOrgUri ?? "unknown"}`,
        client_org_uri: clientOrgUri,
      };
    }
  }

  return { ok: true, client_org_uri: clientOrgUri };
}

export function routeRequiresMtls(pathname: string): boolean {
  if (pathname.startsWith("/protocol/v1/relay")) return true;
  if (pathname === "/protocol/v1/inbox") return true;
  if (pathname === "/protocol/v1/outbox" || pathname.startsWith("/protocol/v1/outbox/")) {
    return true;
  }
  return false;
}

export function trustBundleRoutePublic(pathname: string): boolean {
  return pathname === "/protocol/v1/trust/bundle";
}
