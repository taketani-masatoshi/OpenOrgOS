import { createHash } from "node:crypto";
import { basename } from "node:path";
import { readFileSync, statSync } from "node:fs";
import {
  sivaValidateResponseSchema,
  type SivaMode,
  type SivaValidationConclusion,
} from "../../../schemas/pdf-esign.js";
import {
  assertTrustedEndpoint,
  resolveAllowHttpLoopback,
  resolveDigidocRuntime,
  resolveSivaBaseUrl,
  resolveSivaMode,
} from "./digidoc-runtime.js";

/**
 * SiVa REST client (open-eid national validation stack).
 * Spec: POST /validate { filename, document: base64 }
 * OrgOS copies indication into the ledger — does not reinvent trust.
 * Success requires indication TOTAL-PASSED on every signature + count match.
 */

export type SivaValidateInput = {
  asicePath: string;
  filename?: string;
  /** Pre-check used by mock mode and live short-circuit (lite ASiC + PDF digest). */
  liteOk: boolean;
  pdfDigestOk: boolean | null;
  mode?: SivaMode;
  baseUrl?: string;
  /** Injectable fetch for tests */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  allowHttpLoopback?: boolean;
  maxAsiceBytes?: number;
};

export type SivaCanonicalSummary = {
  indication: string;
  signatures_count: number;
  valid_signatures_count: number;
  validation_time?: string;
  signature_indications: string[];
  filename?: string;
  mock?: boolean;
};

export type SivaValidateResult = {
  mode: SivaMode;
  ok: boolean;
  indication: string;
  signatures_count: number;
  valid_signatures_count: number;
  reason?: string;
  validation_time?: string;
  response_digest?: string;
  summary?: SivaCanonicalSummary;
};

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

export function canonicalizeSivaSummary(
  conclusion: SivaValidationConclusion,
  opts?: { filename?: string; mock?: boolean }
): SivaCanonicalSummary {
  const indications = (conclusion.signatures ?? []).map((s) => s.indication).sort();
  return {
    indication: decideIndication(conclusion),
    signatures_count: conclusion.signaturesCount,
    valid_signatures_count: conclusion.validSignaturesCount,
    validation_time: conclusion.validationTime,
    signature_indications: indications,
    filename: opts?.filename ?? conclusion.validatedDocument?.filename,
    mock: opts?.mock,
  };
}

/**
 * National success: every signature TOTAL-PASSED and counts agree with >0 signatures.
 */
export function isNationalTotalPassed(conclusion: SivaValidationConclusion): boolean {
  const { signaturesCount, validSignaturesCount, signatures } = conclusion;
  if (signaturesCount <= 0) return false;
  if (validSignaturesCount !== signaturesCount) return false;
  if (!signatures || signatures.length === 0) return false;
  if (signatures.length !== signaturesCount) return false;
  return signatures.every((s) => s.indication === "TOTAL-PASSED");
}

function decideIndication(conclusion: SivaValidationConclusion): string {
  if (isNationalTotalPassed(conclusion)) return "TOTAL-PASSED";
  const firstFail = conclusion.signatures?.find((s) => s.indication !== "TOTAL-PASSED");
  if (firstFail?.indication) return firstFail.indication;
  if (conclusion.signaturesCount === 0) return "INDETERMINATE";
  return "TOTAL-FAILED";
}

/** Deterministic mock — CI without a SiVa process. Never used for case completed. */
export function mockSivaValidate(input: {
  liteOk: boolean;
  pdfDigestOk: boolean | null;
  filename?: string;
}): SivaValidateResult {
  if (!input.liteOk) {
    const summary: SivaCanonicalSummary = {
      indication: "TOTAL-FAILED",
      signatures_count: 0,
      valid_signatures_count: 0,
      signature_indications: [],
      filename: input.filename,
      mock: true,
    };
    return {
      mode: "mock",
      ok: false,
      indication: "TOTAL-FAILED",
      signatures_count: 0,
      valid_signatures_count: 0,
      reason: "lite_asice_failed",
      response_digest: sha256Json(summary),
      summary,
    };
  }
  if (input.pdfDigestOk === false) {
    const summary: SivaCanonicalSummary = {
      indication: "TOTAL-FAILED",
      signatures_count: 1,
      valid_signatures_count: 0,
      signature_indications: ["TOTAL-FAILED"],
      filename: input.filename,
      mock: true,
    };
    return {
      mode: "mock",
      ok: false,
      indication: "TOTAL-FAILED",
      signatures_count: 1,
      valid_signatures_count: 0,
      reason: "pdf_digest_mismatch",
      response_digest: sha256Json(summary),
      summary,
    };
  }
  const summary: SivaCanonicalSummary = {
    indication: "TOTAL-PASSED",
    signatures_count: 1,
    valid_signatures_count: 1,
    validation_time: new Date().toISOString(),
    signature_indications: ["TOTAL-PASSED"],
    filename: input.filename ?? "document.asice",
    mock: true,
  };
  return {
    mode: "mock",
    ok: true,
    indication: "TOTAL-PASSED",
    signatures_count: 1,
    valid_signatures_count: 1,
    validation_time: summary.validation_time,
    response_digest: sha256Json(summary),
    summary,
  };
}

export async function validateWithSiva(input: SivaValidateInput): Promise<SivaValidateResult> {
  const runtime = resolveDigidocRuntime({ sivaMode: input.mode });
  const mode = resolveSivaMode(input.mode);
  const filename = input.filename ?? basename(input.asicePath);

  if (mode === "mock") {
    return mockSivaValidate({
      liteOk: input.liteOk,
      pdfDigestOk: input.pdfDigestOk,
      filename,
    });
  }

  const allowHttp =
    input.allowHttpLoopback ?? resolveAllowHttpLoopback() ?? runtime.allow_http_loopback;
  const rawBase = (input.baseUrl ?? resolveSivaBaseUrl())?.replace(/\/$/, "");
  if (!rawBase) {
    return {
      mode: "live",
      ok: false,
      indication: "TOTAL-FAILED",
      signatures_count: 0,
      valid_signatures_count: 0,
      reason: "siva_base_url_missing",
    };
  }
  const trusted = assertTrustedEndpoint(rawBase, {
    allowHttpLoopback: allowHttp,
    kind: "siva",
  });
  if (!trusted.ok) {
    return {
      mode: "live",
      ok: false,
      indication: "TOTAL-FAILED",
      signatures_count: 0,
      valid_signatures_count: 0,
      reason: trusted.reason,
    };
  }
  const baseUrl = trusted.url;

  if (!input.liteOk || input.pdfDigestOk === false) {
    return {
      mode: "live",
      ok: false,
      indication: "TOTAL-FAILED",
      signatures_count: 0,
      valid_signatures_count: 0,
      reason: input.pdfDigestOk === false ? "pdf_digest_mismatch" : "lite_asice_failed",
    };
  }

  const maxBytes = input.maxAsiceBytes ?? runtime.max_asice_bytes;
  const st = statSync(input.asicePath);
  if (st.size > maxBytes) {
    return {
      mode: "live",
      ok: false,
      indication: "TOTAL-FAILED",
      signatures_count: 0,
      valid_signatures_count: 0,
      reason: "asice_too_large",
    };
  }

  const document = readFileSync(input.asicePath).toString("base64");
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? runtime.siva_timeout_ms;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/validate`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ filename, document, reportType: "Simple" }),
      signal: ac.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reason = msg.includes("abort") ? "siva_timeout" : `siva_unreachable: ${msg}`;
    return {
      mode: "live",
      ok: false,
      indication: "TOTAL-FAILED",
      signatures_count: 0,
      valid_signatures_count: 0,
      reason,
    };
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    return {
      mode: "live",
      ok: false,
      indication: "TOTAL-FAILED",
      signatures_count: 0,
      valid_signatures_count: 0,
      reason: `siva_non_json_${res.status}`,
    };
  }

  if (!res.ok) {
    return {
      mode: "live",
      ok: false,
      indication: "TOTAL-FAILED",
      signatures_count: 0,
      valid_signatures_count: 0,
      reason: `siva_http_${res.status}`,
    };
  }

  const parsedBody = sivaValidateResponseSchema.safeParse(body);
  if (!parsedBody.success) {
    return {
      mode: "live",
      ok: false,
      indication: "TOTAL-FAILED",
      signatures_count: 0,
      valid_signatures_count: 0,
      reason: "siva_schema_invalid",
    };
  }

  const conclusion = parsedBody.data.validationReport.validationConclusion;
  const summary = canonicalizeSivaSummary(conclusion, { filename });
  const digest = sha256Json(summary);
  const ok = isNationalTotalPassed(conclusion);
  return {
    mode: "live",
    ok,
    indication: summary.indication,
    signatures_count: summary.signatures_count,
    valid_signatures_count: summary.valid_signatures_count,
    validation_time: summary.validation_time,
    response_digest: digest,
    summary,
    reason: ok ? undefined : "siva_not_total_passed",
  };
}
