import { createHash } from "node:crypto";
import { basename } from "node:path";
import { readFileSync, statSync } from "node:fs";
import {
  sivaValidateResponseSchema,
  type SivaMode,
  type SivaValidationConclusion,
} from "../../../schemas/pdf-esign.js";
import { resolveDigidocRuntime, resolveTrustedEndpoint } from "./digidoc-runtime.js";
import { postEndpointJson } from "./endpoint-json.js";

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

/** Live failure before a trustworthy SiVa conclusion exists — no signatures are counted. */
function liveFailure(reason: string): SivaValidateResult {
  return {
    mode: "live",
    ok: false,
    indication: "TOTAL-FAILED",
    signatures_count: 0,
    valid_signatures_count: 0,
    reason,
  };
}

function mockResult(summary: SivaCanonicalSummary, reason?: string): SivaValidateResult {
  return {
    mode: "mock",
    ok: summary.indication === "TOTAL-PASSED",
    indication: summary.indication,
    signatures_count: summary.signatures_count,
    valid_signatures_count: summary.valid_signatures_count,
    ...(reason ? { reason } : {}),
    ...(summary.validation_time ? { validation_time: summary.validation_time } : {}),
    response_digest: sha256Json(summary),
    summary,
  };
}

/** Deterministic mock — CI without a SiVa process. Never used for case completed. */
export function mockSivaValidate(input: {
  liteOk: boolean;
  pdfDigestOk: boolean | null;
  filename?: string;
}): SivaValidateResult {
  if (!input.liteOk) {
    return mockResult(
      {
        indication: "TOTAL-FAILED",
        signatures_count: 0,
        valid_signatures_count: 0,
        signature_indications: [],
        filename: input.filename,
        mock: true,
      },
      "lite_asice_failed",
    );
  }
  if (input.pdfDigestOk === false) {
    return mockResult(
      {
        indication: "TOTAL-FAILED",
        signatures_count: 1,
        valid_signatures_count: 0,
        signature_indications: ["TOTAL-FAILED"],
        filename: input.filename,
        mock: true,
      },
      "pdf_digest_mismatch",
    );
  }
  return mockResult({
    indication: "TOTAL-PASSED",
    signatures_count: 1,
    valid_signatures_count: 1,
    validation_time: new Date().toISOString(),
    signature_indications: ["TOTAL-PASSED"],
    filename: input.filename ?? "document.asice",
    mock: true,
  });
}

export async function validateWithSiva(input: SivaValidateInput): Promise<SivaValidateResult> {
  const runtime = resolveDigidocRuntime({ sivaMode: input.mode });
  const filename = input.filename ?? basename(input.asicePath);

  if (runtime.siva_mode === "mock") {
    return mockSivaValidate({
      liteOk: input.liteOk,
      pdfDigestOk: input.pdfDigestOk,
      filename,
    });
  }

  const trusted = resolveTrustedEndpoint(input.baseUrl ?? runtime.siva_base_url, {
    allowHttpLoopback: input.allowHttpLoopback ?? runtime.allow_http_loopback,
    kind: "siva",
  });
  if (!trusted.ok) return liveFailure(trusted.reason);

  if (!input.liteOk || input.pdfDigestOk === false) {
    return liveFailure(
      input.pdfDigestOk === false ? "pdf_digest_mismatch" : "lite_asice_failed",
    );
  }

  const maxBytes = input.maxAsiceBytes ?? runtime.max_asice_bytes;
  if (statSync(input.asicePath).size > maxBytes) {
    return liveFailure("asice_too_large");
  }

  const response = await postEndpointJson({
    kind: "siva",
    url: `${trusted.url}/validate`,
    headers: { "content-type": "application/json", accept: "application/json" },
    payload: {
      filename,
      document: readFileSync(input.asicePath).toString("base64"),
      reportType: "Simple",
    },
    fetchImpl: input.fetchImpl ?? fetch,
    timeoutMs: input.timeoutMs ?? runtime.siva_timeout_ms,
  });
  if (!response.ok) return liveFailure(response.reason);
  if (!response.httpOk) return liveFailure(`siva_http_${response.status}`);

  const parsedBody = sivaValidateResponseSchema.safeParse(response.body);
  if (!parsedBody.success) return liveFailure("siva_schema_invalid");

  const conclusion = parsedBody.data.validationReport.validationConclusion;
  const summary = canonicalizeSivaSummary(conclusion, { filename });
  const ok = isNationalTotalPassed(conclusion);
  return {
    mode: "live",
    ok,
    indication: summary.indication,
    signatures_count: summary.signatures_count,
    valid_signatures_count: summary.valid_signatures_count,
    validation_time: summary.validation_time,
    response_digest: sha256Json(summary),
    summary,
    reason: ok ? undefined : "siva_not_total_passed",
  };
}
