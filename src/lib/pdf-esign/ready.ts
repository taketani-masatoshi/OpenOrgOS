/**
 * DigiDoc / SiVa readiness report for `operations esign ready`.
 * Never includes sidecar tokens or other secrets.
 */
import { digidocSidecarHealth } from "./digidoc-sidecar-client.js";
import { resolveDigidocRuntime } from "./digidoc-runtime.js";

export interface PdfEsignReadyReport {
  siva_mode: string;
  siva_base_url: string | null;
  siva_configured: boolean;
  allow_http_loopback: boolean;
  sidecar: {
    ok: boolean;
    reason?: string;
    ready?: boolean;
  };
  sidecar_token_configured: boolean;
  national_complete_requires: string;
  commercial_esp: false;
  host_hint: string;
}

export async function buildPdfEsignReadyReport(opts?: {
  sidecarHealth?: typeof digidocSidecarHealth;
}): Promise<PdfEsignReadyReport> {
  const runtime = resolveDigidocRuntime();
  const healthFn = opts?.sidecarHealth ?? digidocSidecarHealth;
  const sidecar = runtime.digidoc_sidecar_url
    ? await healthFn(runtime.digidoc_sidecar_url)
    : { ok: false, reason: "digidoc_sidecar_url_missing" as const };

  const report: PdfEsignReadyReport = {
    siva_mode: runtime.siva_mode,
    siva_base_url: runtime.siva_base_url ?? null,
    siva_configured: Boolean(runtime.siva_base_url),
    allow_http_loopback: runtime.allow_http_loopback,
    sidecar: {
      ok: sidecar.ok,
      reason: sidecar.reason,
      ready: sidecar.ready,
    },
    sidecar_token_configured: Boolean(runtime.sidecar_token),
    national_complete_requires: "ORGOS_SIVA_MODE=live + TOTAL-PASSED",
    commercial_esp: false,
    host_hint:
      "SiVa on MAL Mac (HTTPS or loopback+ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK) · see pdf-esign-digidoc-runbook",
  };

  // Defense in depth — never ship token material in ready JSON
  const serialized = JSON.stringify(report);
  if (
    /Bearer\s+\S+/i.test(serialized) ||
    (runtime.sidecar_token && serialized.includes(runtime.sidecar_token))
  ) {
    throw new Error("esign ready refused to emit secret material");
  }

  return report;
}
