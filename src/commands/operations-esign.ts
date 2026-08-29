/**
 * `orgos operations esign` — national eID (DigiDoc / SiVa) case operations.
 * Path: src/commands/operations-esign.ts
 *
 * Humans sign on their own device with a national card; OrgOS records the
 * container digest and SiVa indication only (ADR 0014).
 */
import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { digestFile, fileByteLength } from "../lib/document-digest.js";
import {
  findPdfEsignCase,
  insertPdfEsignCase,
  listPdfEsignCases,
  nextPdfEsignCaseId,
  updatePdfEsignCase,
} from "../lib/pdf-esign/case-store.js";
import { getPdfEsignDataDir } from "../lib/pdf-esign/paths.js";
import {
  buildEsignSecretsSnapshot,
  saveEsignSecrets,
} from "../lib/pdf-esign/esign-secrets-store.js";
import { buildPdfEsignReadyReport } from "../lib/pdf-esign/ready.js";
import { digidocPdfEsignAdapter } from "../lib/pdf-esign/adapters/digidoc.js";
import { createAsiceSkeletonViaSidecar } from "../lib/pdf-esign/digidoc-sidecar-client.js";
import { resolveDigidocRuntime } from "../lib/pdf-esign/digidoc-runtime.js";
import {
  asiceContainsPdfDigest,
  inspectAsiceContainer,
} from "../lib/pdf-esign/asice-lite.js";
import { validateWithSiva } from "../lib/pdf-esign/siva-client.js";
import { resolveActiveNationalEidStack } from "../lib/pdf-esign/national-eid.js";
import type { PdfEsignCase, SivaMode } from "../../schemas/pdf-esign.js";

function emit(json: boolean | undefined, payload: unknown, lines: string[]): void {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  for (const line of lines) console.log(line);
}

export async function runEsignReady(opts: { json?: boolean }): Promise<void> {
  const report = await buildPdfEsignReadyReport();
  // Flat shape: probe scripts read the report fields at the top level.
  emit(opts.json, report, [
    `SiVa mode: ${report.siva_mode}`,
    `SiVa base: ${report.siva_base_url ?? "(未設定)"}`,
    `sidecar: ${report.sidecar.ok ? "ok" : (report.sidecar.reason ?? "ng")}`,
    `national complete requires: ${report.national_complete_requires}`,
  ]);
}

export function runEsignEndpointsShow(opts: { json?: boolean }): void {
  const snapshot = buildEsignSecretsSnapshot();
  emit(opts.json, snapshot, [
    `store: ${snapshot.storage_path}`,
    `SiVa: ${snapshot.siva_base_url ?? "(未設定)"} · mode=${snapshot.siva_mode ?? "live"}`,
    `sidecar: ${snapshot.sidecar_url ?? "(未設定)"} · token=${snapshot.sidecar_token_hint ?? "(未設定)"}`,
    `loopback plaintext: ${snapshot.allow_http_loopback ? "許可" : "不可"}`,
  ]);
}

export function runEsignEndpointsSet(opts: {
  sivaUrl?: string;
  sivaMode?: string;
  sidecarUrl?: string;
  sidecarToken?: string;
  allowHttpLoopback?: string;
  json?: boolean;
}): void {
  saveEsignSecrets({
    ORGOS_SIVA_BASE_URL: opts.sivaUrl,
    ORGOS_SIVA_MODE: opts.sivaMode,
    ORGOS_DIGIDOC_SIDECAR_URL: opts.sidecarUrl,
    ORGOS_DIGIDOC_SIDECAR_TOKEN: opts.sidecarToken,
    ORGOS_DIGIDOC_ALLOW_HTTP_LOOPBACK: opts.allowHttpLoopback,
  });
  runEsignEndpointsShow({ json: opts.json });
}

export function runEsignList(opts: { json?: boolean }): void {
  const cases = listPdfEsignCases();
  emit(
    opts.json,
    { ok: true, cases },
    cases.length
      ? cases.map((c) => `${c.id} · ${c.status} · ${c.title}`)
      : ["ケースはありません。"],
  );
}

export function runEsignCreate(opts: {
  pdf: string;
  title: string;
  provider?: string;
  contractId?: string;
  approvalId?: string;
  json?: boolean;
}): PdfEsignCase {
  if (!existsSync(opts.pdf)) {
    throw new Error(`pdf not found: ${opts.pdf}`);
  }
  const now = new Date().toISOString();
  const id = nextPdfEsignCaseId();
  const workDir = join(getPdfEsignDataDir(), "work", id);
  mkdirSync(workDir, { recursive: true });

  const record = insertPdfEsignCase({
    id,
    title: opts.title,
    status: "draft",
    provider_id: opts.provider ?? "digidoc",
    national_eid_stack: resolveActiveNationalEidStack(),
    pdf_path: opts.pdf,
    content_digest: digestFile(opts.pdf),
    byte_length: fileByteLength(opts.pdf),
    work_dir: workDir,
    contract_id: opts.contractId,
    approval_id: opts.approvalId,
    created_at: now,
    updated_at: now,
  });

  emit(opts.json, { ok: true, case: record }, [`✓ ${record.id} 作成`, `  ${workDir}`]);
  return record;
}

function requireCase(id: string): PdfEsignCase {
  const record = findPdfEsignCase(id);
  if (!record) throw new Error(`esign case not found: ${id}`);
  return record;
}

/** Build an unsigned ASiC-E skeleton via the digidoc4j sidecar. */
export async function runEsignPrepare(opts: {
  id: string;
  json?: boolean;
}): Promise<void> {
  const record = requireCase(opts.id);
  const workDir = record.work_dir ?? join(getPdfEsignDataDir(), "work", record.id);
  const outPath = join(workDir, "unsigned.asice");
  const result = await createAsiceSkeletonViaSidecar({
    pdfPath: record.pdf_path,
    filename: basename(record.pdf_path),
    outPath,
  });
  if (!result.ok) {
    emit(opts.json, { ok: false, reason: result.reason }, [
      `✗ skeleton 生成に失敗: ${result.reason}`,
    ]);
    process.exitCode = 1;
    return;
  }
  const next = updatePdfEsignCase(record.id, {
    unsigned_asice_path: result.out_path,
    unsigned_asice_digest: result.digest,
    work_dir: workDir,
  });
  emit(opts.json, { ok: true, case: next }, [`✓ ${outPath}`]);
}

/** Hand the case to the human signer (DigiDoc4 + card). */
export async function runEsignSend(opts: { id: string; json?: boolean }): Promise<void> {
  const record = requireCase(opts.id);
  const result = await digidocPdfEsignAdapter.createEnvelope(record);
  const next = updatePdfEsignCase(record.id, {
    status: "sent",
    external_ref: result.external_ref,
  });
  emit(opts.json, { ok: result.ok, case: next, message: result.message }, [
    `✓ ${next.id} → sent`,
    result.message ?? "",
  ]);
}

export function runEsignAttachContainer(opts: {
  id: string;
  asice: string;
  json?: boolean;
}): PdfEsignCase {
  const record = requireCase(opts.id);
  if (!existsSync(opts.asice)) {
    throw new Error(`asice not found: ${opts.asice}`);
  }
  const next = updatePdfEsignCase(record.id, {
    container_path: opts.asice,
    container_digest: digestFile(opts.asice),
    status: "partially_signed",
  });
  emit(opts.json, { ok: true, case: next }, [`✓ container 添付 ${next.id}`]);
  return next;
}

/**
 * Validate the attached container. Only live SiVa TOTAL-PASSED completes a case.
 */
export async function runEsignVerifyDigidoc(opts: {
  id: string;
  sivaMode?: SivaMode;
  json?: boolean;
}): Promise<void> {
  const record = requireCase(opts.id);
  if (!record.container_path || !existsSync(record.container_path)) {
    throw new Error(`container missing for ${record.id} — attach-container first`);
  }
  const runtime = resolveDigidocRuntime({ sivaMode: opts.sivaMode });
  const lite = inspectAsiceContainer(record.container_path, {
    maxAsiceBytes: runtime.max_asice_bytes,
  });
  const pdfDigestOk = record.content_digest
    ? asiceContainsPdfDigest(lite, record.content_digest)
    : null;

  const result = await validateWithSiva({
    asicePath: record.container_path,
    liteOk: lite.ok,
    pdfDigestOk,
    mode: opts.sivaMode,
  });

  const nationallyVerified = result.mode === "live" && result.ok;
  const next = updatePdfEsignCase(record.id, {
    siva_mode: result.mode,
    siva_indication: result.indication,
    siva_validated_at: new Date().toISOString(),
    siva_response_digest: result.response_digest,
    siva_signatures_count: result.signatures_count,
    siva_valid_signatures_count: result.valid_signatures_count,
    siva_reason: result.reason,
    status: nationallyVerified
      ? "completed"
      : result.ok
        ? "partially_signed"
        : "failed",
  });

  emit(
    opts.json,
    { ok: result.ok, nationally_verified: nationallyVerified, case: next },
    [
      `${result.ok ? "✓" : "✗"} ${next.id} · ${result.indication} · mode=${result.mode}`,
      nationallyVerified ? "  国家検証完了（completed）" : `  ${result.reason ?? ""}`,
    ],
  );
  if (!result.ok) process.exitCode = 1;
}

/** attach-container + verify in one step (live SiVa). */
export async function runEsignAcceptLive(opts: {
  id: string;
  asice: string;
  json?: boolean;
}): Promise<void> {
  runEsignAttachContainer({ id: opts.id, asice: opts.asice, json: false });
  await runEsignVerifyDigidoc({ id: opts.id, sivaMode: "live", json: opts.json });
}
