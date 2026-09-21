import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  etaxOfficialPackageSchema,
  etaxSpecCatalogSchema,
  etaxSubmissionRecordSchema,
  type EtaxOfficialPackage,
  type EtaxSpecCatalog,
  type EtaxSpecEntry,
  type EtaxSubmissionRecord,
  type EtaxTaxType,
  type EtaxFilingKind,
} from "../../../schemas/finance/etax.js";
import { getClock, getIdGenerator } from "../runtime-context.js";
import { withYamlFileLock } from "../yaml-atomic.js";
import { findOperatorById } from "../org/operators.js";
import { operatorHasPermission } from "../console-auth/operator-rbac.js";
import { assertHumanApprovalContext } from "../org/human-approval-context.js";
import type { HumanApprovalContext } from "../../../schemas/org/human-approval-context.js";
import type { OrgApprovalRequest } from "../../../schemas/org/approval.js";
import { createCompanyEvent } from "../company-events.js";

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

/** Present only on hash-checked product adapters. A caller-supplied `certified: true` flag is not enough. */
export const etaxCertifiedProductAdapter = Symbol.for("orgos.etax.certifiedProductAdapter");

export type EtaxProductionReadinessItem = { id: string; ready: boolean; reason: string };

/**
 * Official e-Tax production stays closed in this module. Fixture URLs and locally
 * computed hashes cannot flip any item to ready.
 */
export function etaxProductionReadiness(_input?: {
  catalog?: EtaxSpecCatalog;
  xsdSha256?: string;
  mappingSha256?: string;
  certificationEvidenceSha256?: string;
  signer?: unknown;
  transport?: unknown;
}): { productionReady: boolean; items: EtaxProductionReadinessItem[] } {
  void _input;
  const reason = "接続試験証跡がない";
  const ids = [
    "official_xsd", "retrieved_at", "form_revision", "procedure_id", "xsd_sha256",
    "mapping_sha256", "certification_evidence_sha256", "signer", "transport",
  ];
  return { productionReady: false, items: ids.map((id) => ({ id, ready: false, reason })) };
}

function assertHashCertifiedProductAdapter(adapter: object, kind: string, allowTestDouble: boolean | undefined): void {
  if (allowTestDouble) return;
  if ((adapter as { [etaxCertifiedProductAdapter]?: boolean })[etaxCertifiedProductAdapter] !== true) {
    throw new Error(`e-Tax ${kind} is not a hash-certified product adapter`);
  }
}

function packageDigest(pkg: Pick<EtaxOfficialPackage,
  "tax_type" | "fiscal_year" | "procedure_id" | "spec_id" | "form_revision" | "filing_kind" | "prior_receipt_number" | "payload_sha256" | "attachments">): string {
  return sha256(JSON.stringify({
    taxType: pkg.tax_type,
    fiscalYear: pkg.fiscal_year,
    procedureId: pkg.procedure_id,
    specId: pkg.spec_id,
    formRevision: pkg.form_revision,
    filingKind: pkg.filing_kind,
    priorReceiptNumber: pkg.prior_receipt_number ?? null,
    payloadSha256: pkg.payload_sha256,
    attachments: pkg.attachments.map(({ document_id, document_type, sha256: digest }) => ({ document_id, document_type, sha256: digest })),
  }));
}

function assertSubmissionId(id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id) || id.includes("..")) {
    throw new Error("invalid e-Tax submission id");
  }
  return id;
}

function resolveXsdInsideRoot(repositoryRoot: string, xsdPath: string): string {
  if (!xsdPath || xsdPath.includes("\0") || isAbsolute(xsdPath)) {
    throw new Error("e-Tax XSD path must be a relative path inside the repository");
  }
  const root = resolve(repositoryRoot);
  const resolved = resolve(root, xsdPath);
  const rel = relative(root, resolved);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("e-Tax XSD path escapes the repository root");
  }
  return resolved;
}

function assertPackageEvidenceUnchanged(pkg: EtaxOfficialPackage): void {
  for (const attachment of pkg.attachments) {
    if (!existsSync(attachment.path) || sha256(readFileSync(attachment.path)) !== attachment.sha256) {
      throw new Error(`e-Tax attachment changed after validation: ${attachment.document_id}`);
    }
  }
  if (packageDigest(pkg) !== pkg.package_sha256) throw new Error("e-Tax package hash mismatch");
}

function atomicJsonWrite(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temp, path);
}

export function loadEtaxSpecCatalog(path: string): EtaxSpecCatalog {
  return etaxSpecCatalogSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function resolveEtaxSpec(input: {
  catalog: EtaxSpecCatalog;
  taxType: EtaxTaxType;
  filingDate: string;
  procedureId?: string;
}): EtaxSpecEntry {
  const matches = input.catalog.entries.filter((entry) =>
    entry.tax_type === input.taxType &&
    (!input.procedureId || entry.procedure_id === input.procedureId) &&
    entry.effective_from <= input.filingDate &&
    (!entry.effective_to || entry.effective_to >= input.filingDate));
  if (matches.length !== 1) {
    throw new Error(`e-Tax specification resolution expected one entry, found ${matches.length}`);
  }
  const entry = matches[0]!;
  if (!entry.certified) throw new Error(`e-Tax specification ${entry.id} is not certified`);
  return entry;
}

export function assessEtaxSpecCatalog(input: {
  catalog: EtaxSpecCatalog;
  asOf: string;
  maxUncheckedDays?: number;
}): { ready: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const asOfMs = Date.parse(input.asOf);
  if (!Number.isFinite(asOfMs)) throw new Error("invalid e-Tax catalog assessment date");
  const maxAgeMs = (input.maxUncheckedDays ?? 30) * 86_400_000;
  const ids = new Set<string>();
  for (const entry of input.catalog.entries) {
    if (ids.has(entry.id)) errors.push(`duplicate specification id: ${entry.id}`);
    ids.add(entry.id);
    if (asOfMs - Date.parse(entry.checked_at) > maxAgeMs) warnings.push(`specification check is stale: ${entry.id}`);
  }
  const families = new Set(input.catalog.entries.map((entry) => entry.source_url.includes("/ksk2/") ? "ksk2" : entry.source_url.includes("shiyo3") ? "shiyo3" : "other"));
  if (families.has("ksk2") && families.has("shiyo3")) {
    errors.push("catalog mixes KSK2 and current e-Tax (shiyo3) specifications");
  }
  for (let i = 0; i < input.catalog.entries.length; i += 1) {
    for (let j = i + 1; j < input.catalog.entries.length; j += 1) {
      const a = input.catalog.entries[i]!;
      const b = input.catalog.entries[j]!;
      if (a.tax_type !== b.tax_type || a.procedure_id !== b.procedure_id) continue;
      const aEnd = a.effective_to ?? "9999-12-31";
      const bEnd = b.effective_to ?? "9999-12-31";
      if (a.effective_from <= bEnd && b.effective_from <= aEnd) errors.push(`overlapping specification periods: ${a.id}, ${b.id}`);
    }
  }
  return { ready: errors.length === 0 && warnings.length === 0, errors, warnings };
}

export type EtaxXsdValidator = (input: {
  xmlPath: string;
  xsdPath: string;
}) => { valid: boolean; validatorName: string; validatorVersion: string; errors?: string[] };

export interface EtaxFormMapper<TSource> {
  readonly name: string;
  readonly mappingRevision: string;
  readonly certified: boolean;
  map(input: { source: TSource; spec: EtaxSpecEntry }): string;
}

export function writeOfficialEtaxXml<TSource>(input: {
  source: TSource;
  spec: EtaxSpecEntry;
  mapper: EtaxFormMapper<TSource>;
  outputPath: string;
  allowUncertifiedTestDouble?: boolean;
}): { path: string; sha256: string } {
  assertHashCertifiedProductAdapter(input.mapper, "form mapper", input.allowUncertifiedTestDouble);
  if (!input.mapper.certified) throw new Error("e-Tax form mapper is not certified");
  if (input.mapper.mappingRevision !== input.spec.mapping_revision) {
    throw new Error("e-Tax form mapper revision does not match specification");
  }
  const xml = input.mapper.map({ source: input.source, spec: input.spec });
  if (/not-for-etax|OrgOSCorporateTaxDraft|advisor-handoff/i.test(xml)) {
    throw new Error("advisor handoff draft cannot be used as official e-Tax XML");
  }
  mkdirSync(dirname(input.outputPath), { recursive: true });
  writeFileSync(input.outputPath, xml, { encoding: "utf8", mode: 0o600 });
  return { path: input.outputPath, sha256: sha256(xml) };
}

/**
 * Registers XML only after a real, injected XSD validator accepts it. This module
 * deliberately contains no permissive fallback or home-grown XML approximation.
 */
export function prepareOfficialEtaxPackage(input: {
  spec: EtaxSpecEntry;
  fiscalYear: string;
  xmlPath: string;
  repositoryRoot: string;
  validator: EtaxXsdValidator;
  filingKind?: EtaxFilingKind;
  priorReceiptNumber?: string;
  attachments?: Array<{ documentId: string; documentType: string; path: string }>;
  allowUncertifiedTestDouble?: boolean;
}): EtaxOfficialPackage {
  if ((input as { schema?: string }).schema === "orgos.jp.eltax-official-package.v1") {
    throw new Error("eLTAX package cannot be prepared as official e-Tax XML");
  }
  const xsdPath = resolveXsdInsideRoot(input.repositoryRoot, input.spec.xsd_path);
  if (!existsSync(xsdPath)) throw new Error(`official e-Tax XSD is missing: ${input.spec.xsd_path}`);
  const actualXsdHash = sha256(readFileSync(xsdPath));
  if (actualXsdHash !== input.spec.xsd_sha256) throw new Error("official e-Tax XSD hash mismatch");
  if (!existsSync(input.xmlPath)) throw new Error(`e-Tax XML payload is missing: ${input.xmlPath}`);
  const xml = readFileSync(input.xmlPath, "utf8");
  if (/not-for-etax|OrgOSCorporateTaxDraft|advisor-handoff/i.test(xml)) {
    throw new Error("advisor handoff draft cannot be registered as official e-Tax XML");
  }
  assertHashCertifiedProductAdapter(input.validator, "XSD validator", input.allowUncertifiedTestDouble);
  const validation = input.validator({ xmlPath: input.xmlPath, xsdPath });
  if (!validation.valid) throw new Error(`official e-Tax XSD validation failed: ${(validation.errors ?? []).join("; ")}`);
  const payloadSha256 = sha256(xml);
  const attachments = (input.attachments ?? []).map((attachment) => {
    if (!existsSync(attachment.path)) throw new Error(`e-Tax attachment is missing: ${attachment.path}`);
    return { document_id: attachment.documentId, document_type: attachment.documentType,
      path: attachment.path, sha256: sha256(readFileSync(attachment.path)) };
  });
  const packageSha256 = packageDigest({
    tax_type: input.spec.tax_type,
    fiscal_year: input.fiscalYear,
    procedure_id: input.spec.procedure_id,
    spec_id: input.spec.id,
    form_revision: input.spec.form_revision,
    filing_kind: input.filingKind ?? "original",
    prior_receipt_number: input.priorReceiptNumber,
    payload_sha256: payloadSha256,
    attachments,
  });
  return etaxOfficialPackageSchema.parse({
    schema: "orgos.jp.etax-official-package.v1",
    package_id: `ETAX-PKG-${payloadSha256.slice(0, 20)}`,
    tax_type: input.spec.tax_type,
    fiscal_year: input.fiscalYear,
    procedure_id: input.spec.procedure_id,
    spec_id: input.spec.id,
    form_revision: input.spec.form_revision,
    filing_kind: input.filingKind ?? "original",
    prior_receipt_number: input.priorReceiptNumber,
    payload_path: input.xmlPath,
    payload_sha256: payloadSha256,
    package_sha256: packageSha256,
    xsd_sha256: actualXsdHash,
    validated_at: getClock().nowIso(),
    validator: { name: validation.validatorName, version: validation.validatorVersion },
    attachments,
  });
}

export interface EtaxSigner {
  readonly name: string;
  readonly certified: boolean;
  sign(input: { payloadPath: string; payloadSha256: string }): Promise<{
    algorithm: string;
    certificateFingerprintSha256: string;
    signaturePath: string;
  }>;
}

export interface EtaxTransport {
  readonly name: string;
  readonly certified: boolean;
  send(input: { package: EtaxOfficialPackage; signaturePath: string; idempotencyKey: string; requestId: string }): Promise<{
    requestId: string;
    receipt?: EtaxReceipt;
  }>;
  lookup?(input: { requestId: string; idempotencyKey: string }): Promise<
    { status: "found"; receipt: EtaxReceipt } | { status: "not_found" } | { status: "unknown" }
  >;
}

export type EtaxReceipt = {
  receiptNumber: string;
  receivedAt: string;
  taxOffice: string;
  result: "received" | "accepted" | "rejected";
  message?: string;
  xtx?: Buffer;
};

const transitions: Record<EtaxSubmissionRecord["status"], EtaxSubmissionRecord["status"][]> = {
  prepared: ["validated", "cancelled"], validated: ["approved", "cancelled"], approved: ["signed", "cancelled"], signed: ["sending", "cancelled"],
  sending: ["received", "rejected"], received: ["accepted", "rejected"], accepted: [], rejected: [], cancelled: [],
};

export type EtaxAuditRow = {
  seq: number;
  prev_sha256: string;
  submission_id: string;
  status: string;
  package_sha256: string;
  receipt_number: string | null;
  prior_receipt_number: string | null;
  row_sha256: string;
};

export class EtaxSubmissionStore {
  readonly production: boolean;
  constructor(
    private readonly root: string,
    private readonly retentionYears = 10,
    security?: { production?: boolean; encryptedStorage?: boolean },
  ) {
    if (!Number.isInteger(retentionYears) || retentionYears < 1) throw new Error("e-Tax retention years must be a positive integer");
    this.production = security?.production === true;
    if (this.production && !security?.encryptedStorage) {
      throw new Error("production e-Tax state requires encrypted storage");
    }
  }
  private path(id: string) { return join(this.root, `${assertSubmissionId(id)}.json`); }
  private locked<T>(fn: () => T): T {
    return withYamlFileLock(join(this.root, ".submission-store"), fn, { retries: 120, retryDelayMs: 25 });
  }
  create(pkg: EtaxOfficialPackage, idempotencyKey: string): EtaxSubmissionRecord {
    return this.locked(() => {
      mkdirSync(this.root, { recursive: true });
      const existing = this.list().find((row) => row.idempotency_key === idempotencyKey);
      if (existing) {
        if (existing.package.package_sha256 !== pkg.package_sha256) {
          throw new Error("idempotency key reused for a different e-Tax package");
        }
        return existing;
      }
      const now = getClock().nowIso();
      const retention = new Date(now);
      retention.setUTCFullYear(retention.getUTCFullYear() + this.retentionYears);
      const record = etaxSubmissionRecordSchema.parse({
        schema: "orgos.jp.etax-submission.v1", submission_id: getIdGenerator().uniqueId("ETAX"), revision: 0,
        idempotency_key: idempotencyKey, status: "prepared", package: pkg, attempts: [],
        retention_until: retention.toISOString().slice(0, 10), legal_hold: false, created_at: now, updated_at: now,
      });
      atomicJsonWrite(this.path(record.submission_id), record);
      this.appendAudit(record);
      return record;
    });
  }
  get(id: string): EtaxSubmissionRecord {
    return etaxSubmissionRecordSchema.parse(JSON.parse(readFileSync(this.path(id), "utf8")));
  }
  list(): EtaxSubmissionRecord[] {
    if (!existsSync(this.root)) return [];
    return readdirSync(this.root).filter((name) => name.endsWith(".json")).map((name) =>
      etaxSubmissionRecordSchema.parse(JSON.parse(readFileSync(join(this.root, name), "utf8"))));
  }
  save(record: EtaxSubmissionRecord): EtaxSubmissionRecord {
    return this.locked(() => this.saveUnlocked(record));
  }
  private saveUnlocked(record: EtaxSubmissionRecord): EtaxSubmissionRecord {
    const current = this.get(record.submission_id);
    if (current.revision !== record.revision) throw new Error("stale e-Tax submission revision");
    if (current.legal_hold && !record.legal_hold) throw new Error("e-Tax legal hold cannot be cleared");
    if (record.retention_until < current.retention_until) throw new Error("e-Tax retention cannot be shortened");
    const parsed = etaxSubmissionRecordSchema.parse({ ...record, revision: record.revision + 1, updated_at: getClock().nowIso() });
    atomicJsonWrite(this.path(parsed.submission_id), parsed);
    this.appendAudit(parsed);
    return parsed;
  }
  transition(id: string, next: EtaxSubmissionRecord["status"]): EtaxSubmissionRecord {
    return this.locked(() => {
      const record = this.get(id);
      if (!transitions[record.status].includes(next)) throw new Error(`invalid e-Tax transition: ${record.status} -> ${next}`);
      return this.saveUnlocked({ ...record, status: next });
    });
  }
  readAudit(): EtaxAuditRow[] {
    const path = join(this.root, "audit-chain.jsonl");
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as EtaxAuditRow);
  }
  private appendAudit(record: EtaxSubmissionRecord): void {
    const rows = this.readAudit();
    const body = {
      seq: rows.length + 1,
      prev_sha256: rows.at(-1)?.row_sha256 ?? "0".repeat(64),
      submission_id: record.submission_id,
      status: record.status,
      package_sha256: record.package.package_sha256,
      receipt_number: record.receipt?.receipt_number ?? null,
      prior_receipt_number: record.package.prior_receipt_number ?? null,
    };
    const row: EtaxAuditRow = { ...body, row_sha256: sha256(JSON.stringify(body)) };
    const path = join(this.root, "audit-chain.jsonl");
    mkdirSync(this.root, { recursive: true });
    writeFileSync(path, `${[...rows, row].map((item) => JSON.stringify(item)).join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  }
}

export function verifyEtaxSubmissionEvidence(record: EtaxSubmissionRecord, auditChain?: EtaxAuditRow[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!existsSync(record.package.payload_path) || sha256(readFileSync(record.package.payload_path)) !== record.package.payload_sha256) {
    errors.push("payload evidence missing or hash mismatch");
  }
  try { assertPackageEvidenceUnchanged(record.package); } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (record.signature) {
    if (!existsSync(record.signature.signature_path)) errors.push("signature evidence missing");
    else if (sha256(readFileSync(record.signature.signature_path)) !== record.signature.signature_sha256) {
      errors.push("signature evidence hash mismatch");
    }
  }
  if (record.receipt?.xtx_path) {
    const current = existsSync(record.receipt.xtx_path) ? sha256(readFileSync(record.receipt.xtx_path)) : undefined;
    if (!current || current !== record.receipt.xtx_sha256) errors.push("receipt .xtx evidence missing or hash mismatch");
  }
  if (["accepted", "rejected"].includes(record.status) && !record.receipt) errors.push("terminal submission has no receipt evidence");
  errors.push(...verifyEtaxAuditChain(record, auditChain ?? []));
  return { ok: errors.length === 0, errors };
}

function verifyEtaxAuditChain(record: EtaxSubmissionRecord, rows: EtaxAuditRow[]): string[] {
  const errors: string[] = [];
  const mine = rows.filter((row) => row.submission_id === record.submission_id);
  if (mine.length === 0) errors.push("e-Tax audit chain missing");
  let expectedPrev = "0".repeat(64);
  for (const row of rows) {
    const { row_sha256: digest, ...body } = row;
    if (sha256(JSON.stringify(body)) !== digest) errors.push("e-Tax audit chain hash mismatch");
    if (row.prev_sha256 !== expectedPrev) errors.push("e-Tax audit chain link mismatch");
    expectedPrev = digest;
  }
  const statuses = mine.map((row) => row.status);
  const tail = mine.at(-1);
  if (!tail || tail.status !== record.status) errors.push("e-Tax audit chain does not match submission status");
  if (tail && tail.package_sha256 !== record.package.package_sha256) errors.push("e-Tax audit chain package hash mismatch");
  if (["approved", "signed", "sending", "received", "accepted", "rejected"].includes(record.status) && !statuses.includes("approved")) {
    errors.push("e-Tax audit chain missing approval");
  }
  if (["signed", "sending", "received", "accepted", "rejected"].includes(record.status) && !statuses.includes("signed")) {
    errors.push("e-Tax audit chain missing signature");
  }
  if (record.package.filing_kind !== "original" && !mine.some((row) => row.prior_receipt_number === record.package.prior_receipt_number)) {
    errors.push("e-Tax audit chain missing prior receipt number");
  }
  if (record.receipt && !mine.some((row) => row.receipt_number === record.receipt?.receipt_number)) {
    errors.push("e-Tax audit chain missing receipt number");
  }
  return errors;
}

export function approveEtaxSubmission(input: {
  store: EtaxSubmissionStore;
  submissionId: string;
  operatorId: string;
  authorize: (input: { operatorId: string; payloadSha256: string; packageSha256: string }) => boolean;
}): EtaxSubmissionRecord {
  const record = input.store.get(input.submissionId);
  if (record.status !== "validated") throw new Error("only a validated e-Tax submission can be approved");
  const payloadHash = sha256(readFileSync(record.package.payload_path));
  if (payloadHash !== record.package.payload_sha256) throw new Error("e-Tax payload changed after validation");
  assertPackageEvidenceUnchanged(record.package);
  if (!input.authorize({ operatorId: input.operatorId, payloadSha256: payloadHash, packageSha256: record.package.package_sha256 })) {
    throw new Error("operator is not authorized to approve this e-Tax payload");
  }
  return input.store.save({
    ...record,
    status: "approved",
    approval: {
      operator_id: input.operatorId,
      approved_at: getClock().nowIso(),
      payload_sha256: payloadHash,
      package_sha256: record.package.package_sha256,
    },
  });
}

export function cancelEtaxSubmission(input: {
  store: EtaxSubmissionStore;
  submissionId: string;
  operatorId: string;
  reason: string;
  authorize: (operatorId: string) => boolean;
}): EtaxSubmissionRecord {
  const record = input.store.get(input.submissionId);
  if (!["prepared", "validated", "approved", "signed"].includes(record.status)) {
    throw new Error(`e-Tax submission cannot be cancelled from ${record.status}`);
  }
  if (!input.reason.trim()) throw new Error("e-Tax cancellation reason is required");
  if (!input.authorize(input.operatorId)) throw new Error("operator is not authorized to cancel e-Tax submission");
  return input.store.save({ ...record, status: "cancelled", cancellation: {
    operator_id: input.operatorId, cancelled_at: getClock().nowIso(), reason: input.reason.trim(),
  }});
}

export function approveEtaxSubmissionWithHumanContext(input: {
  store: EtaxSubmissionStore;
  submissionId: string;
  operatorId: string;
  approval: OrgApprovalRequest;
  humanContext: HumanApprovalContext;
}): EtaxSubmissionRecord {
  const record = input.store.get(input.submissionId);
  if (input.approval.subject_type !== "etax.submission" || input.approval.subject_ref !== record.package.package_sha256) {
    throw new Error("human approval is not bound to this e-Tax package");
  }
  const operator = findOperatorById(input.operatorId);
  if (!operatorHasPermission(operator, "chat:approve")) throw new Error("operator lacks chat:approve for e-Tax submission");
  assertHumanApprovalContext({ context: input.humanContext, approval: input.approval, operatorId: input.operatorId });
  return approveEtaxSubmission({ store: input.store, submissionId: input.submissionId, operatorId: input.operatorId,
    authorize: ({ packageSha256 }) => packageSha256 === input.approval.subject_ref });
}

export async function signEtaxSubmission(input: {
  store: EtaxSubmissionStore; submissionId: string; signer: EtaxSigner;
  allowUncertifiedTestDouble?: boolean;
}): Promise<EtaxSubmissionRecord> {
  const record = input.store.get(input.submissionId);
  if (record.status !== "approved" || !record.approval) throw new Error("e-Tax submission must be approved before signing");
  assertHashCertifiedProductAdapter(input.signer, "signer", input.allowUncertifiedTestDouble);
  if (!input.signer.certified) throw new Error("e-Tax signer is not certified");
  const payloadHash = sha256(readFileSync(record.package.payload_path));
  assertPackageEvidenceUnchanged(record.package);
  if (payloadHash !== record.package.payload_sha256 || payloadHash !== record.approval.payload_sha256) {
    throw new Error("approved e-Tax payload hash mismatch");
  }
  if (record.package.package_sha256 !== record.approval.package_sha256) throw new Error("approved e-Tax package hash mismatch");
  const signed = await input.signer.sign({ payloadPath: record.package.payload_path, payloadSha256: payloadHash });
  if (!existsSync(signed.signaturePath)) throw new Error("e-Tax signer did not produce a signature file");
  const signatureSha256 = sha256(readFileSync(signed.signaturePath));
  const next = input.store.save({ ...record, status: "signed", signature: {
    algorithm: signed.algorithm,
    certificate_fingerprint_sha256: signed.certificateFingerprintSha256,
    signed_payload_sha256: payloadHash,
    signed_package_sha256: record.package.package_sha256,
    signature_path: signed.signaturePath,
    signature_sha256: signatureSha256,
    signed_at: getClock().nowIso(),
  }});
  return next;
}

export async function sendEtaxSubmission(input: {
  store: EtaxSubmissionStore; submissionId: string; transport: EtaxTransport;
  allowUncertifiedTestDouble?: boolean;
}): Promise<EtaxSubmissionRecord> {
  if (input.store.production && !etaxProductionReadiness().productionReady) {
    throw new Error("production e-Tax send is not enabled");
  }
  let record = input.store.get(input.submissionId);
  assertHashCertifiedProductAdapter(input.transport, "transport", input.allowUncertifiedTestDouble);
  if (!input.transport.certified) throw new Error("e-Tax transport adapter is not certified");
  if (record.status === "sending") throw new Error("e-Tax submission is already sending; recover before retry");
  if (record.status === "accepted" || record.status === "rejected") {
    throw new Error(`e-Tax submission cannot be sent after ${record.status}`);
  }
  assertSignedPayloadIntact(record);
  const sealed = sealSignedPayload(record);
  const requestId = `${record.submission_id}-${record.attempts.length + 1}`;
  try {
    record = input.store.save({ ...record, status: "sending", attempts: [...record.attempts, {
      attempted_at: getClock().nowIso(), request_id: requestId, outcome: "started",
    }]});
    const result = await input.transport.send({
      package: { ...record.package, payload_path: sealed.payloadPath },
      signaturePath: sealed.signaturePath,
      idempotencyKey: record.idempotency_key,
      requestId,
    });
    if (result.requestId !== requestId) {
      throw new Error("e-Tax module requestId does not match the persisted attempt");
    }
    const attempts = record.attempts.map((attempt, i) => i === record.attempts.length - 1
      ? { ...attempt, request_id: result.requestId, outcome: "received" as const } : attempt);
    let receipt: EtaxSubmissionRecord["receipt"];
    if (result.receipt) {
      let xtxPath: string | undefined;
      let xtxHash: string | undefined;
      if (result.receipt.xtx) {
        xtxPath = join(thisReceiptDir(input.submissionId, record.package.payload_path), `${sha256(result.receipt.receiptNumber).slice(0, 24)}.xtx`);
        mkdirSync(dirname(xtxPath), { recursive: true });
        writeFileSync(xtxPath, result.receipt.xtx, { mode: 0o600 });
        xtxHash = sha256(result.receipt.xtx);
      }
      receipt = { receipt_number: result.receipt.receiptNumber, received_at: result.receipt.receivedAt,
        tax_office: result.receipt.taxOffice, result: result.receipt.result, message: result.receipt.message,
        xtx_path: xtxPath, xtx_sha256: xtxHash };
    }
    const status = result.receipt?.result ?? "received";
    return input.store.save({ ...record, status, attempts, transport: {
      adapter: input.transport.name, request_id: result.requestId, sent_at: getClock().nowIso(),
    }, receipt });
  } finally {
    rmSync(sealed.dir, { recursive: true, force: true });
  }
}

/** Reconciles a process crash after the durable `sending` write without blind re-send. */
export async function recoverInterruptedEtaxSubmission(input: {
  store: EtaxSubmissionStore;
  submissionId: string;
  transport: EtaxTransport;
}): Promise<EtaxSubmissionRecord> {
  const record = input.store.get(input.submissionId);
  if (record.status !== "sending") return record;
  if (!input.transport.certified || !input.transport.lookup) {
    throw new Error("certified e-Tax receipt lookup is required to recover an interrupted send");
  }
  const attempt = record.attempts.at(-1);
  if (!attempt || attempt.outcome !== "started") throw new Error("interrupted e-Tax send has no active attempt");
  const lookup = await input.transport.lookup({ requestId: attempt.request_id, idempotencyKey: record.idempotency_key });
  if (lookup.status === "unknown") return record;
  if (lookup.status === "not_found") {
    const attempts = record.attempts.map((row, index) => index === record.attempts.length - 1
      ? { ...row, outcome: "failed" as const, detail: "receipt lookup confirmed not found" } : row);
    return input.store.save({ ...record, status: "signed", attempts });
  }
  const receipt = persistEtaxReceipt(record, lookup.receipt);
  const attempts = record.attempts.map((row, index) => index === record.attempts.length - 1
    ? { ...row, outcome: "received" as const } : row);
  return input.store.save({ ...record, status: lookup.receipt.result, receipt, attempts });
}

export async function pollEtaxReceipt(input: {
  store: EtaxSubmissionStore;
  submissionId: string;
  transport: EtaxTransport;
}): Promise<EtaxSubmissionRecord> {
  const record = input.store.get(input.submissionId);
  if (record.status !== "received" || !record.transport) return record;
  if (!input.transport.certified || !input.transport.lookup) throw new Error("certified e-Tax receipt lookup is required");
  const lookup = await input.transport.lookup({ requestId: record.transport.request_id, idempotencyKey: record.idempotency_key });
  if (lookup.status !== "found") return record;
  const receipt = persistEtaxReceipt(record, lookup.receipt);
  return input.store.save({ ...record, status: lookup.receipt.result, receipt });
}

export function recordEtaxAuditEvent(record: EtaxSubmissionRecord): string {
  const event = createCompanyEvent({
    kind: "finance",
    title: `e-Tax ${record.package.tax_type} ${record.status}`,
    slug: `etax-${record.submission_id.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`,
    related: { application_id: record.submission_id },
    notes: `package_sha256=${record.package.package_sha256}\nstatus=${record.status}\nreceipt=${record.receipt?.receipt_number ?? "pending"}`,
  });
  return event.id;
}

function assertSignedPayloadIntact(record: EtaxSubmissionRecord): void {
  if (record.status !== "signed" || !record.signature) throw new Error("e-Tax submission must be signed before sending");
  if (!existsSync(record.package.payload_path)) throw new Error("e-Tax payload missing before send");
  const payloadHash = sha256(readFileSync(record.package.payload_path));
  assertPackageEvidenceUnchanged(record.package);
  if (payloadHash !== record.package.payload_sha256 || payloadHash !== record.signature.signed_payload_sha256) {
    throw new Error("e-Tax payload changed after signature");
  }
  if (record.package.package_sha256 !== record.signature.signed_package_sha256) {
    throw new Error("e-Tax package changed after signature");
  }
  if (!existsSync(record.signature.signature_path) ||
      sha256(readFileSync(record.signature.signature_path)) !== record.signature.signature_sha256) {
    throw new Error("e-Tax signature file changed after signing");
  }
}

function sealSignedPayload(record: EtaxSubmissionRecord): { dir: string; payloadPath: string; signaturePath: string } {
  assertSignedPayloadIntact({ ...record, status: "signed" });
  const dir = mkdtempSync(join(tmpdir(), "orgos-etax-seal-"));
  const payloadPath = join(dir, "payload.xml");
  const signaturePath = join(dir, "signature.bin");
  const payload = readFileSync(record.package.payload_path);
  const signature = readFileSync(record.signature!.signature_path);
  if (sha256(payload) !== record.package.payload_sha256) throw new Error("e-Tax payload changed after signature");
  if (sha256(signature) !== record.signature!.signature_sha256) throw new Error("e-Tax signature file changed after signing");
  writeFileSync(payloadPath, payload, { mode: 0o600 });
  writeFileSync(signaturePath, signature, { mode: 0o600 });
  return { dir, payloadPath, signaturePath };
}

function persistEtaxReceipt(record: EtaxSubmissionRecord, source: EtaxReceipt): NonNullable<EtaxSubmissionRecord["receipt"]> {
  let xtxPath: string | undefined;
  let xtxHash: string | undefined;
  if (source.xtx) {
    xtxPath = join(thisReceiptDir(record.submission_id, record.package.payload_path), `${sha256(source.receiptNumber).slice(0, 24)}.xtx`);
    mkdirSync(dirname(xtxPath), { recursive: true });
    writeFileSync(xtxPath, source.xtx, { mode: 0o600 });
    xtxHash = sha256(source.xtx);
  }
  return { receipt_number: source.receiptNumber, received_at: source.receivedAt,
    tax_office: source.taxOffice, result: source.result, message: source.message,
    xtx_path: xtxPath, xtx_sha256: xtxHash };
}

function thisReceiptDir(submissionId: string, payloadPath: string): string {
  return join(dirname(payloadPath), "receipts", submissionId);
}
