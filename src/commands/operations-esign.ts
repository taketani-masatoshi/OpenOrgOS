/**
 * `orgos operations esign` — national eID (DigiDoc / SiVa) case operations.
 * Path: src/commands/operations-esign.ts
 *
 * Humans sign on their own device with a national card; OrgOS records the
 * container digest and SiVa indication only (ADR 0014).
 */
import { existsSync } from "node:fs";
import {
  listPdfEsignCases,
  requirePdfEsignCase,
} from "../lib/pdf-esign/case-store.js";
import {
  attachEsignContainerFile,
  createEsignCaseFromFile,
  prepareEsignSkeleton,
  sendEsignCase,
  verifyEsignContainer,
} from "../lib/pdf-esign/case-workflow.js";
import {
  buildEsignSecretsSnapshot,
  saveEsignSecrets,
} from "../lib/pdf-esign/esign-secrets-store.js";
import { buildPdfEsignReadyReport } from "../lib/pdf-esign/ready.js";
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
  const record = createEsignCaseFromFile({
    pdfPath: opts.pdf,
    title: opts.title,
    providerId: opts.provider,
    contractId: opts.contractId,
    approvalId: opts.approvalId,
  });
  emit(opts.json, { ok: true, case: record }, [
    `✓ ${record.id} 作成`,
    `  ${record.work_dir}`,
  ]);
  return record;
}

/** Build an unsigned ASiC-E skeleton via the digidoc4j sidecar. */
export async function runEsignPrepare(opts: {
  id: string;
  json?: boolean;
}): Promise<void> {
  const prepared = await prepareEsignSkeleton(requirePdfEsignCase(opts.id));
  if (!prepared.ok) {
    emit(opts.json, { ok: false, reason: prepared.reason }, [
      `✗ skeleton 生成に失敗: ${prepared.reason}`,
    ]);
    process.exitCode = 1;
    return;
  }
  emit(opts.json, { ok: true, case: prepared.case }, [
    `✓ ${prepared.case.unsigned_asice_path}`,
  ]);
}

/** Hand the case to the human signer (DigiDoc4 + card). */
export async function runEsignSend(opts: { id: string; json?: boolean }): Promise<void> {
  const sent = await sendEsignCase(requirePdfEsignCase(opts.id));
  emit(opts.json, sent, [`✓ ${sent.case.id} → sent`, sent.message ?? ""]);
}

export function runEsignAttachContainer(opts: {
  id: string;
  asice: string;
  json?: boolean;
}): PdfEsignCase {
  const next = attachEsignContainerFile(requirePdfEsignCase(opts.id), opts.asice);
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
  const record = requirePdfEsignCase(opts.id);
  if (!record.container_path || !existsSync(record.container_path)) {
    throw new Error(`container missing for ${record.id} — attach-container first`);
  }
  const {
    result,
    nationallyVerified,
    case: next,
  } = await verifyEsignContainer(record, record.container_path, opts.sivaMode);

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
