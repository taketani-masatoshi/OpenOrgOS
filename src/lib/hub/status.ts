/**
 * Witness Hub operational status — GA checks, bind/TLS gate, cert expiry, metrics probe.
 * Path: src/lib/hub/status.ts
 *
 * Read-only. Private keys are never read or transmitted; the certificate is
 * inspected for its validity window only (see witness-hub-operations.md).
 */
import { X509Certificate } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getInstallRoot } from "../orgos-paths.js";
import { buildWitnessHubGaReport, type HubGaReport } from "./ga-check.js";
import {
  hubPublicTlsRequired,
  isHubPublicBindHost,
  isHubPublicMode,
} from "./public-bind.js";

export type HubTlsStatus = {
  cert_path: string;
  key_path: string;
  present: boolean;
  not_before?: string;
  not_after?: string;
  expired?: boolean;
  subject?: string;
  error?: string;
};

export type HubMetricsProbe = {
  url: string;
  reachable: boolean;
  status_code?: number;
  detail: string;
};

export type HubStatusReport = {
  ga: HubGaReport;
  bind: {
    host: string;
    public_mode: boolean;
    public_host: boolean;
    tls_required: boolean;
    allowed: boolean;
    blocked_reason?: string;
  };
  tls: HubTlsStatus;
  metrics: HubMetricsProbe;
};

export function hubTlsDir(root = getInstallRoot()): string {
  return join(root, "deploy", "witness-hub", "tls");
}

/** Inspect the certificate only — the private key is never read. */
export function readHubTlsStatus(root = getInstallRoot()): HubTlsStatus {
  const dir = hubTlsDir(root);
  const certPath = join(dir, "server.pem");
  const keyPath = join(dir, "server.key");
  const present = existsSync(certPath) && existsSync(keyPath);
  if (!present) {
    return { cert_path: certPath, key_path: keyPath, present: false };
  }
  try {
    const cert = new X509Certificate(readFileSync(certPath));
    const notAfter = new Date(cert.validTo);
    return {
      cert_path: certPath,
      key_path: keyPath,
      present: true,
      subject: cert.subject,
      not_before: new Date(cert.validFrom).toISOString(),
      not_after: notAfter.toISOString(),
      expired: notAfter.getTime() < Date.now(),
    };
  } catch (err) {
    return {
      cert_path: certPath,
      key_path: keyPath,
      present: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function probeHubMetrics(
  metricsUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HubMetricsProbe> {
  try {
    const res = await fetchImpl(metricsUrl, { method: "GET" });
    return {
      url: metricsUrl,
      reachable: true,
      status_code: res.status,
      detail: res.ok ? "hub /metrics 応答あり" : `hub が ${res.status} を返した`,
    };
  } catch (err) {
    return {
      url: metricsUrl,
      reachable: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export function hubMetricsUrl(): string {
  return (
    process.env.ORGOS_HUB_METRICS_URL?.trim() ||
    `${process.env.ORGOS_HUB_URL?.trim() || "http://127.0.0.1:9477"}/metrics`
  );
}

export async function buildHubStatusReport(opts?: {
  fetchImpl?: typeof fetch;
  host?: string;
}): Promise<HubStatusReport> {
  const host = opts?.host ?? process.env.ORGOS_HUB_BIND_HOST?.trim() ?? "127.0.0.1";
  const tls = readHubTlsStatus();
  const publicHost = isHubPublicBindHost(host);
  const tlsRequired = hubPublicTlsRequired();
  const usableTls = tls.present && !tls.expired && !tls.error;
  const blocked = publicHost && tlsRequired && !usableTls;

  return {
    ga: buildWitnessHubGaReport(),
    bind: {
      host,
      public_mode: isHubPublicMode(),
      public_host: publicHost,
      tls_required: tlsRequired,
      allowed: !blocked,
      ...(blocked
        ? {
            blocked_reason: tls.present
              ? "TLS 証明書が期限切れまたは読めません。deploy/witness-hub/tls/ を差し替えてください。"
              : "公開 bind には TLS が必要です。deploy/witness-hub/tls/server.pem と server.key を配置してください。",
          }
        : {}),
    },
    tls,
    metrics: await probeHubMetrics(hubMetricsUrl(), opts?.fetchImpl),
  };
}
