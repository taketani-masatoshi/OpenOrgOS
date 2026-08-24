import { existsSync, readFileSync } from "node:fs";
import {
  digidocRuntimeConfigSchema,
  type DigidocRuntimeConfig,
  type SivaMode,
  sivaModeSchema,
} from "../../../schemas/pdf-esign.js";
import { readYamlFile } from "../utils.js";
import { loadNationalEidConfig } from "./national-eid.js";
import {
  getDigidocRuntimeConfigPath,
  moduleDigidocRuntimeConfigExamplePath,
} from "./paths.js";

/**
 * Resolved DigiDoc/SiVa endpoints: digidoc.yaml ⊃ national-eid.yaml ⊃ env.
 * OrgOS records results; it does not invent national validation.
 */
export type ResolvedDigidocRuntime = {
  siva_base_url?: string;
  digidoc_sidecar_url?: string;
  /** Default is live. mock only when ORGOS_SIVA_MODE=mock or explicit override. */
  siva_mode: SivaMode;
  allow_http_loopback: boolean;
  siva_timeout_ms: number;
  sidecar_timeout_ms: number;
  max_pdf_bytes: number;
  max_asice_bytes: number;
  sidecar_token?: string;
};

function loadDigidocYaml(): DigidocRuntimeConfig {
  const path = getDigidocRuntimeConfigPath();
  if (existsSync(path)) {
    return readYamlFile(path, digidocRuntimeConfigSchema);
  }
  const example = moduleDigidocRuntimeConfigExamplePath();
  if (existsSync(example)) {
    return readYamlFile(example, digidocRuntimeConfigSchema);
  }
  return digidocRuntimeConfigSchema.parse({ version: 1 });
}

function mergeRuntime(): DigidocRuntimeConfig {
  return loadDigidocYaml();
}

/**
 * mock only when explicitly requested (env or override).
 * Unset ⇒ live (production path). CI unit tests must set ORGOS_SIVA_MODE=mock.
 */
export function resolveSivaMode(override?: SivaMode): SivaMode {
  if (override) return override;
  const raw = process.env.ORGOS_SIVA_MODE?.trim().toLowerCase();
  if (raw === "mock" || raw === "live") {
    return sivaModeSchema.parse(raw);
  }
  return "live";
}

function resolveSivaBaseUrlIgnoringMode(): string | undefined {
  const fromEnv = process.env.ORGOS_SIVA_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const digi = mergeRuntime();
  if (digi.siva_base_url?.trim()) return digi.siva_base_url.trim().replace(/\/$/, "");
  const national = loadNationalEidConfig();
  if (national.siva_base_url?.trim()) {
    return national.siva_base_url.trim().replace(/\/$/, "");
  }
  return undefined;
}

export function resolveSivaBaseUrl(): string | undefined {
  return resolveSivaBaseUrlIgnoringMode();
}

export function resolveDigidocSidecarUrl(): string | undefined {
  const fromEnv = process.env.ORGOS_DIGIDOC_SIDECAR_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const digi = mergeRuntime();
  if (digi.digidoc_sidecar_url?.trim()) {
    return digi.digidoc_sidecar_url.trim().replace(/\/$/, "");
  }
  const national = loadNationalEidConfig();
  if (national.digidoc_sidecar_url?.trim()) {
    return national.digidoc_sidecar_url.trim().replace(/\/$/, "");
  }
  return undefined;
}

export function resolveAllowHttpLoopback(): boolean {
  const env = process.env.ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK?.trim().toLowerCase();
  if (env === "1" || env === "true" || env === "yes") return true;
  if (env === "0" || env === "false" || env === "no") return false;
  return Boolean(mergeRuntime().allow_http_loopback);
}

export function resolveDigidocSidecarToken(): string | undefined {
  const fromEnv = process.env.ORGOS_DIGIDOC_SIDECAR_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const tokenFile = process.env.ORGOS_DIGIDOC_SIDECAR_TOKEN_FILE?.trim();
  if (tokenFile && existsSync(tokenFile)) {
    return readFileSync(tokenFile, "utf8").trim() || undefined;
  }
  return undefined;
}

export function resolveDigidocRuntime(opts?: {
  sivaMode?: SivaMode;
}): ResolvedDigidocRuntime {
  const cfg = mergeRuntime();
  return {
    siva_base_url: resolveSivaBaseUrl(),
    digidoc_sidecar_url: resolveDigidocSidecarUrl(),
    siva_mode: resolveSivaMode(opts?.sivaMode),
    allow_http_loopback: resolveAllowHttpLoopback(),
    siva_timeout_ms: cfg.siva_timeout_ms,
    sidecar_timeout_ms: cfg.sidecar_timeout_ms,
    max_pdf_bytes: cfg.max_pdf_bytes,
    max_asice_bytes: cfg.max_asice_bytes,
    sidecar_token: resolveDigidocSidecarToken(),
  };
}

export type EndpointPolicyResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/**
 * Production endpoints must be HTTPS.
 * http://127.0.0.1 and http://localhost allowed only when allow_http_loopback.
 */
export function assertTrustedEndpoint(
  rawUrl: string,
  opts: { allowHttpLoopback: boolean; kind: "siva" | "sidecar" }
): EndpointPolicyResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: `${opts.kind}_url_invalid` };
  }
  const host = parsed.hostname.toLowerCase();
  const isLoopback =
    host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
  if (parsed.protocol === "https:") {
    return { ok: true, url: parsed.toString().replace(/\/$/, "") };
  }
  if (parsed.protocol === "http:" && isLoopback && opts.allowHttpLoopback) {
    return { ok: true, url: parsed.toString().replace(/\/$/, "") };
  }
  if (parsed.protocol === "http:") {
    return {
      ok: false,
      reason: isLoopback
        ? `${opts.kind}_http_loopback_denied`
        : `${opts.kind}_https_required`,
    };
  }
  return { ok: false, reason: `${opts.kind}_url_scheme_unsupported` };
}
