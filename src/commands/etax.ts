import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { EtaxException } from "../../schemas/etax/errors.js";
import {
  ETAX_COMPATIBILITY_STATUS,
  assertProductionSubmitAllowed,
  buildOfficialXml,
  buildReturnPackage,
  currentEtaxSpecVersion,
  findReturnPackage,
  findSubmission,
  loadEtaxProductionGate,
  productionSubmitBlockedReasons,
  productionStatusLine,
  specStatusReport,
  submissionForPackage,
  signSubmission,
  markSubmissionReady,
  submitToEtax,
  fetchEtaxReceipt,
  evaluateProductionEnablement,
  assertProductionEnableRefused,
  releaseProductionSubmission,
  ETAX_PRODUCTION_ENABLE_SUBJECT,
  validateAndAdvance,
  fetchAndUnpackEtaxSpecs,
  officialXsdAvailable,
  contentHashMessage,
  ETAX_APPROVAL_SUBJECT,
  parseContentHashMessage,
  probeEtaxHostBound,
  evaluateAllDx,
  bindOfficialHostCatalogs,
  readCatalogHostBoundTip,
  writeTransmissionSubmitEvidence,
  writeNtaCompletionEvidence,
  promoteRho0010Supported,
  syncProductCopyForRho0010,
} from "../lib/etax/index.js";
import { getWorkspaceRoot } from "../lib/orgos-paths.js";
import { getModuleTier } from "../lib/module-readiness.js";
import { readFileSync as readFs, writeFileSync as writeFs } from "node:fs";
import { join as pathJoin } from "node:path";
import { getInstallRoot } from "../lib/orgos-paths.js";
import type { EtaxSignatureProviderId } from "../../schemas/etax/signature.js";
import type { EtaxEnvironment } from "../../schemas/etax/submission-state.js";
import { requireCliDataWrite, requireCliHumanApproval } from "../lib/console-auth/cli-operator.js";
import { resolveCliOperatorId } from "../lib/console-auth/cli-operator.js";
import { proposeOrgApproval } from "../lib/org/approval/propose.js";
import { findOrgApproval, humanApproveOrgApproval } from "../lib/org/approval/approve.js";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function banner(): string {
  return `${productionStatusLine()}\n${ETAX_COMPATIBILITY_STATUS}`;
}

function fail(error: unknown): never {
  if (error instanceof EtaxException) {
    console.error(JSON.stringify({ ok: false, ...error.etax, banner: banner() }));
  }
  throw error;
}

export function runEtaxSpecStatus(opts: { json?: boolean }): void {
  const report = {
    ok: true,
    banner: banner(),
    spec: specStatusReport(),
    specVersion: currentEtaxSpecVersion(),
    productionGate: loadEtaxProductionGate(),
    productionBlockers: productionSubmitBlockedReasons("production"),
  };
  if (opts.json) {
    printJson(report);
    return;
  }
  console.log(banner());
  console.log(`KSK2 baseline: ${report.spec.baseline.label}`);
  console.log(`listing: ${report.spec.baseline.listingUrl}`);
  console.log(`KSK2 spec registered: ${report.spec.ksk2Registered ? "yes" : "no"}`);
  console.log(`official XSD unpacked: ${report.spec.officialXsdUnpacked ? "yes" : "no"}`);
  for (const row of report.spec.requiredChecks ?? []) {
    console.log(
      `  required ${row.id}: disk=${row.diskSha256 ? row.diskSha256.slice(0, 12) : "missing"} match=${row.match}`,
    );
  }
  for (const row of report.spec.artifacts) {
    const hash = row.sha256 ? row.sha256.slice(0, 12) : "not-retrieved";
    const unpacked = row.unpackedFileCount != null ? ` files=${row.unpackedFileCount}` : "";
    const req = row.required ? " [required]" : "";
    console.log(`- ${row.id}: ${row.status} sha256=${hash}${unpacked}${req}`);
  }
  console.log(`production blockers: ${report.productionBlockers.join("; ") || "(none)"}`);
}

function defaultGeneratedXmlPath(submissionId: string): string {
  return join(getWorkspaceRoot(), "data", "etax", "generated", `${submissionId}.xml`);
}

export function runEtaxBuild(opts: { from?: string; out?: string; json?: boolean }): void {
  try {
    requireCliDataWrite({ command: "etax build", permission: "escalate:plan" });
    if (!opts.from || !existsSync(opts.from)) {
      throw new EtaxException({
        code: "ETAX_BUILD_INPUT_MISSING",
        blocked: "SPEC_BLOCKED",
        message: "etax build requires --from <return-package.json>",
      });
    }
    const raw = JSON.parse(readFileSync(opts.from, "utf-8")) as {
      taxpayerId: string;
      procedureCode: string;
      taxYear: string;
      revision?: number;
      payload?: unknown;
      sourceReferences?: [];
    };
    const pkg = buildReturnPackage({
      taxpayerId: raw.taxpayerId,
      procedureCode: raw.procedureCode,
      taxYear: raw.taxYear,
      revision: raw.revision ?? 0,
      payload: raw.payload ?? {},
      createdBy: resolveCliOperatorId(),
      sourceReferences: raw.sourceReferences ?? [],
    });
    const sub = submissionForPackage(pkg.id);
    try {
      const built = buildOfficialXml(pkg.id, { actor: resolveCliOperatorId() });
      const outPath = opts.out ?? defaultGeneratedXmlPath(built.submission.id);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, built.xml, "utf-8");
      const payload = {
        ok: true,
        banner: banner(),
        package: pkg,
        submissionId: built.submission.id,
        status: built.submission.status,
        xmlHash: built.xmlHash,
        xmlPath: outPath,
      };
      if (opts.json) printJson(payload);
      else {
        console.log(banner());
        console.log(
          `ReturnPackage ${pkg.id} submission=${built.submission.id} status=${built.submission.status}`,
        );
        console.log(`xmlHash=${built.xmlHash}`);
        console.log(`wrote ${outPath}`);
      }
    } catch (error) {
      if (!(error instanceof EtaxException) || error.etax.blocked !== "SPEC_BLOCKED") {
        fail(error);
      }
      const result = {
        ok: true,
        banner: banner(),
        package: pkg,
        submissionId: sub.id,
        status: sub.status,
        xml: "SPEC_BLOCKED",
        xmlBlocked: error instanceof EtaxException ? error.etax : String(error),
      };
      if (opts.json) {
        printJson(result);
        return;
      }
      console.log(banner());
      console.log(`ReturnPackage ${pkg.id} contentHash=${pkg.contentHash}`);
      console.log(
        officialXsdAvailable()
          ? "Official XML: SPEC_BLOCKED (KSK2 envelope/field mapping not registered)"
          : "Official XML: SPEC_BLOCKED (KSK2 XSD not unpacked)",
      );
    }
  } catch (error) {
    fail(error);
  }
}

export function runEtaxValidate(opts: {
  id: string;
  xml?: string;
  env?: EtaxEnvironment;
  json?: boolean;
}): void {
  try {
    requireCliDataWrite({ command: "etax validate", permission: "escalate:plan" });
    const sub = findSubmission(opts.id) ?? submissionForPackage(opts.id);
    const pkg = findReturnPackage(sub.packageId);
    if (!pkg) {
      throw new EtaxException({
        code: "ETAX_PACKAGE_NOT_FOUND",
        message: `ReturnPackage missing for ${opts.id}`,
      });
    }
    const defaultXml = defaultGeneratedXmlPath(sub.id);
    const xmlPath =
      opts.xml && existsSync(opts.xml)
        ? opts.xml
        : existsSync(defaultXml)
          ? defaultXml
          : undefined;
    if (opts.xml && !existsSync(opts.xml)) {
      throw new EtaxException({
        code: "ETAX_VALIDATE_XML_MISSING",
        message: `XML file not found: ${opts.xml}`,
      });
    }
    if (!xmlPath) {
      throw new EtaxException({
        code: "ETAX_VALIDATE_XML_MISSING",
        blocked: "SPEC_BLOCKED",
        message: "etax validate requires --xml or a generated file from etax build",
      });
    }
    const xml = readFileSync(xmlPath, "utf-8");
    const { report, submission } = validateAndAdvance({
      submissionId: sub.id,
      xml,
      env: opts.env ?? "mock",
      actor: resolveCliOperatorId(),
    });
    const payload = {
      ok: report.ok,
      banner: banner(),
      submissionId: submission.id,
      status: submission.status,
      contentHash: pkg.contentHash,
      layers: Object.fromEntries(
        report.layers.map((row) => [row.layer, { status: row.status, note: row.detail }]),
      ),
    };
    if (opts.json) printJson(payload);
    else {
      console.log(banner());
      console.log(`submission ${submission.id} status=${submission.status}`);
      for (const row of report.layers) {
        console.log(`Layer ${row.layer}: ${row.status} — ${row.detail}`);
      }
    }
    if (report.layers.some((row) => row.status === "fail") || !report.ok) {
      throw new EtaxException({
        code: "ETAX_VALIDATION_FAILED",
        message: "e-Tax validation failed on one or more layers",
      });
    }
  } catch (error) {
    fail(error);
  }
}

export async function runEtaxSpecFetch(opts: {
  ids?: string[];
  unpack?: boolean;
  force?: boolean;
  json?: boolean;
}): Promise<void> {
  try {
    requireCliDataWrite({ command: "etax spec fetch", permission: "escalate:plan" });
    const result = await fetchAndUnpackEtaxSpecs({
      ids: opts.ids,
      unpack: opts.unpack !== false,
      fetchRemote: true,
      force: Boolean(opts.force),
    });
    if (opts.json) {
      printJson({ ok: true, banner: banner(), ...result });
      return;
    }
    console.log(banner());
    for (const row of result.artifacts) {
      console.log(
        `${row.id} sha256=${row.sha256.slice(0, 12)} bytes=${row.bytes} unpacked=${row.unpackedFileCount ?? "skipped"}`
      );
    }
  } catch (error) {
    fail(error);
  }
}

export async function runEtaxSpecUnpack(opts: { ids?: string[]; json?: boolean }): Promise<void> {
  try {
    requireCliDataWrite({ command: "etax spec unpack", permission: "escalate:plan" });
    const out = await fetchAndUnpackEtaxSpecs({
      ids: opts.ids,
      unpack: true,
      fetchRemote: false,
    });
    if (opts.json) {
      printJson({ ok: true, banner: banner(), ...out });
      return;
    }
    console.log(banner());
    for (const row of out.artifacts) {
      console.log(`${row.id} unpacked=${row.unpackedFileCount ?? 0}`);
    }
  } catch (error) {
    fail(error);
  }
}

export function runEtaxApprovePropose(opts: { id: string; json?: boolean }): void {
  try {
    requireCliDataWrite({ command: "etax approve propose", permission: "escalate:plan" });
    const sub = findSubmission(opts.id) ?? submissionForPackage(opts.id);
    const pkg = findReturnPackage(sub.packageId);
    if (!pkg) {
      throw new EtaxException({
        code: "ETAX_PACKAGE_NOT_FOUND",
        message: `ReturnPackage missing for ${opts.id}`,
      });
    }
    const approval = proposeOrgApproval({
      scope: "internal",
      subjectType: ETAX_APPROVAL_SUBJECT,
      proposedBy: resolveCliOperatorId(),
      subjectRef: sub.id,
      message: contentHashMessage(pkg.contentHash),
    });
    const payload = {
      ok: true,
      banner: banner(),
      approvalId: approval.approval_id,
      submissionId: sub.id,
      contentHash: pkg.contentHash,
      note: "Grant with orgos etax approve --approval-id (ceo/approver). Self-approval is forbidden.",
    };
    if (opts.json) printJson(payload);
    else {
      console.log(banner());
      console.log(`proposed ${approval.approval_id} for ${sub.id} hash=${pkg.contentHash}`);
    }
  } catch (error) {
    fail(error);
  }
}

export function runEtaxApprove(opts: { id: string; approvalId?: string; json?: boolean }): void {
  try {
    const auth = requireCliHumanApproval("etax approve");
    const sub = findSubmission(opts.id) ?? submissionForPackage(opts.id);
    const pkg = findReturnPackage(sub.packageId);
    if (!pkg) {
      throw new EtaxException({
        code: "ETAX_PACKAGE_NOT_FOUND",
        message: `ReturnPackage missing for ${opts.id}`,
      });
    }
    const approvalId = opts.approvalId;
    if (!approvalId) {
      throw new EtaxException({
        code: "ETAX_APPROVAL_ID_REQUIRED",
        message: "etax approve requires --approval-id from etax approve propose (ADR 0038)",
      });
    }
    const pending = findOrgApproval(approvalId);
    if (!pending) {
      throw new EtaxException({
        code: "ETAX_ORG_APPROVAL_NOT_FOUND",
        message: `Org approval ${approvalId} not found`,
      });
    }
    if (pending.subject_type !== ETAX_APPROVAL_SUBJECT || pending.subject_ref !== sub.id) {
      throw new EtaxException({
        code: "ETAX_ORG_APPROVAL_MISMATCH",
        message: `Org approval ${approvalId} is not bound to submission ${sub.id}`,
      });
    }
    const bound = parseContentHashMessage(pending.message);
    if (bound !== pkg.contentHash) {
      throw new EtaxException({
        code: "ETAX_APPROVAL_HASH_MISMATCH",
        blocked: "HASH_MISMATCH",
        message: "Org approval contentHash does not match the live ReturnPackage",
      });
    }
    if (pending.status === "pending_approval") {
      humanApproveOrgApproval({
        approvalId,
        approverId: auth.record.display_name,
        operatorId: auth.record.operator_id,
        source: "cli",
      });
    }
    // applyEtaxApproval runs inside humanApproveOrgApproval (atomic with rollback).
    const next = findSubmission(sub.id) ?? submissionForPackage(sub.packageId);
    if (next.status !== "APPROVED") {
      throw new EtaxException({
        code: "ETAX_APPROVAL_NOT_APPLIED",
        message: `Org approval ${approvalId} did not advance submission to APPROVED (status=${next.status})`,
      });
    }
    const payload = {
      ok: true,
      banner: banner(),
      submissionId: next.id,
      status: next.status,
      approvalId: next.approvalId,
      contentHash: next.contentHash,
    };
    if (opts.json) printJson(payload);
    else {
      console.log(banner());
      console.log(`${next.id} status=${next.status} approval=${next.approvalId}`);
    }
  } catch (error) {
    fail(error);
  }
}

export function runEtaxReady(opts: { id: string; env?: EtaxEnvironment; json?: boolean }): void {
  try {
    requireCliDataWrite({ command: "etax ready", permission: "chat:approve" });
    const env = opts.env ?? "mock";
    const sub = findSubmission(opts.id) ?? submissionForPackage(opts.id);
    const next = markSubmissionReady({
      submissionId: sub.id,
      env,
      actor: resolveCliOperatorId(),
    });
    const payload = { ok: true, banner: banner(), submissionId: next.id, status: next.status };
    if (opts.json) printJson(payload);
    else {
      console.log(banner());
      console.log(`${next.id} status=${next.status}`);
    }
  } catch (error) {
    fail(error);
  }
}

function parseSignatureProvider(raw: string | undefined): EtaxSignatureProviderId | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (raw === "mock" || raw === "official") return raw;
  throw new EtaxException({
    code: "ETAX_SIGNATURE_PROVIDER_UNKNOWN",
    field: "provider",
    message: `Unknown signature provider ${raw} (use mock or official)`,
  });
}

export async function runEtaxSign(opts: {
  id: string;
  env?: EtaxEnvironment;
  provider?: string;
  xml?: string;
  json?: boolean;
}): Promise<void> {
  try {
    requireCliDataWrite({ command: "etax sign", permission: "chat:approve" });
    const env = opts.env ?? "mock";
    const provider = parseSignatureProvider(opts.provider);
    if (!opts.xml || !existsSync(opts.xml)) {
      throw new EtaxException({
        code: "ETAX_SIGN_NO_XML",
        field: "xml",
        blocked: "SPEC_BLOCKED",
        message:
          "etax sign requires --xml <official-xml> bound to xmlHash. PIN/password are not CLI flags.",
      });
    }
    const document = readFileSync(opts.xml);
    const sub = findSubmission(opts.id) ?? submissionForPackage(opts.id);
    const { submission, signature } = await signSubmission({
      submissionId: sub.id,
      env,
      provider,
      document,
      actor: resolveCliOperatorId(),
    });
    const payload = {
      ok: true,
      banner: banner(),
      submissionId: submission.id,
      status: submission.status,
      signatureRef: submission.signatureRef,
      provider: signature.provider,
      legal: signature.legal,
      documentHash: signature.documentHash,
    };
    if (opts.json) printJson(payload);
    else {
      console.log(banner());
      console.log(
        `${submission.id} status=${submission.status} provider=${signature.provider} legal=${signature.legal}`
      );
    }
  } catch (error) {
    fail(error);
  }
}

export async function runEtaxSubmit(opts: {
  id: string;
  env: EtaxEnvironment;
  xml?: string;
  json?: boolean;
}): Promise<void> {
  try {
    if (opts.env === "production") {
      assertProductionSubmitAllowed("production");
    }
    requireCliHumanApproval("etax submit");
    if (!opts.xml || !existsSync(opts.xml)) {
      throw new EtaxException({
        code: "ETAX_SUBMIT_NO_XML",
        field: "xml",
        blocked: "SPEC_BLOCKED",
        message: "etax submit requires --xml <official-xml> bound to xmlHash",
      });
    }
    const sub = findSubmission(opts.id) ?? submissionForPackage(opts.id);
    const { submission, result } = await submitToEtax({
      submissionId: sub.id,
      env: opts.env,
      document: readFileSync(opts.xml),
      actor: resolveCliOperatorId(),
    });
    const payload = {
      ok: result.ok,
      banner: banner(),
      submissionId: submission.id,
      status: submission.status,
      requestId: result.requestId,
      transportStatus: result.transportStatus,
      message: result.message,
    };
    if (opts.json) printJson(payload);
    else {
      console.log(banner());
      console.log(
        `${submission.id} status=${submission.status} requestId=${result.requestId ?? "none"}`
      );
      console.log(result.message);
    }
  } catch (error) {
    fail(error);
  }
}

export async function runEtaxReceipt(opts: {
  id: string;
  env?: EtaxEnvironment;
  json?: boolean;
}): Promise<void> {
  try {
    const env = opts.env ?? "mock";
    const sub = findSubmission(opts.id) ?? submissionForPackage(opts.id);
    const { submission, receipt } = await fetchEtaxReceipt({
      submissionId: sub.id,
      env,
      actor: resolveCliOperatorId(),
    });
    const payload = {
      ok: true,
      banner: banner(),
      submissionId: submission.id,
      status: submission.status,
      receiptNumber: receipt.receiptNumber,
      receiptStatus: receipt.status,
      note: "RECEIVED_BY_ETAX is not tax-correctness.",
    };
    if (opts.json) printJson(payload);
    else {
      console.log(banner());
      console.log(
        `${submission.id} status=${submission.status} receipt=${receipt.receiptNumber ?? "none"}`
      );
    }
  } catch (error) {
    fail(error);
  }
}

export function runEtaxProductionReview(opts: { json?: boolean }): void {
  const review = evaluateProductionEnablement();
  if (opts.json) {
    printJson({ ok: true, ...review });
    return;
  }
  console.log(review.banner);
  console.log(`certified=${review.certified}`);
  console.log(`NTA transmission test completed=${review.nta_transmission_test.completed}`);
  console.log(`evidence present=${review.nta_transmission_test.evidence_present}`);
  console.log(`blockers: ${review.blockers.join("; ")}`);
}

export function runEtaxProductionEnable(): void {
  try {
    requireCliHumanApproval("etax production enable");
    assertProductionEnableRefused();
  } catch (error) {
    fail(error);
  }
}

export function runEtaxProductionRelease(opts: { approvalId?: string; json?: boolean }): void {
  try {
    requireCliHumanApproval("etax production release");
    if (!opts.approvalId) {
      throw new EtaxException({
        code: "ETAX_PRODUCTION_RELEASE_NO_APPROVAL",
        blocked: "PRODUCTION_DISABLED",
        message: `etax production release requires --approval-id (subject ${ETAX_PRODUCTION_ENABLE_SUBJECT})`,
      });
    }
    const result = releaseProductionSubmission({
      approvalId: opts.approvalId,
      actor: resolveCliOperatorId(),
    });
    const payload = {
      ok: true,
      banner: result.banner,
      certified: result.certified,
      path: result.path,
      approvalId: opts.approvalId,
      note: result.certified
        ? "Production gate released. Confirm RHO0010 SUPPORTED + ToS sync before commercial 対応完了 claim."
        : "Gate flags written; certified still false — check blockers via production review.",
    };
    if (opts.json) printJson(payload);
    else {
      console.log(result.banner);
      console.log(`certified=${result.certified} wrote ${result.path}`);
    }
  } catch (error) {
    fail(error);
  }
}

export async function runEtaxHostStatus(opts: { json?: boolean }): Promise<void> {
  try {
    const tip = readCatalogHostBoundTip();
    const probe = await probeEtaxHostBound();
    const payload = {
      ok: true,
      banner: banner(),
      reachable: probe.reachable,
      health: probe.health,
      error: probe.error,
      tipCatalogHostBound: tip,
      note: tip.signature && tip.transport
        ? "Tip catalogs hostBound=true"
        : "Repo tip keeps hostBound false until orgos etax host bind on Windows",
    };
    if (opts.json) printJson(payload);
    else {
      console.log(banner());
      console.log(`host reachable=${probe.reachable}`);
      console.log(`tip hostBound signature=${tip.signature} transport=${tip.transport}`);
      if (probe.health) {
        console.log(
          `signatureBound=${probe.health.signatureBound} transportBound=${probe.health.transportBound}`,
        );
        console.log(probe.health.detail ?? "");
      }
      if (probe.error) console.log(probe.error);
    }
  } catch (error) {
    fail(error);
  }
}

export async function runEtaxHostBind(opts: {
  iUnderstandWindows?: boolean;
  json?: boolean;
}): Promise<void> {
  try {
    requireCliHumanApproval("etax host bind");
    const result = await bindOfficialHostCatalogs({
      actor: resolveCliOperatorId(),
      iUnderstandWindows: Boolean(opts.iUnderstandWindows),
    });
    const payload = { ok: true, banner: banner(), ...result };
    if (opts.json) printJson(payload);
    else {
      console.log(banner());
      console.log(`bound signature=${result.signaturePath}`);
      console.log(`bound transport=${result.transportPath}`);
      console.log(result.healthDetail);
    }
  } catch (error) {
    fail(error);
  }
}

export async function runEtaxAcceptanceReport(opts: { json?: boolean }): Promise<void> {
  try {
    const report = await evaluateAllDx();
    const payload = {
      ok: report.ok,
      banner: banner(),
      certified: report.certified,
      results: report.results,
      readiness: getModuleTier("jp_etax"),
    };
    if (opts.json) printJson(payload);
    else {
      console.log(banner());
      console.log(`acceptance ok=${report.ok} certified=${report.certified}`);
      for (const row of report.results) {
        console.log(`${row.id} ${row.ok ? "PASS" : "FAIL"} — ${row.detail}`);
        if (!row.ok) console.log(`  blockers: ${row.blockers.join("; ")}`);
      }
    }
  } catch (error) {
    fail(error);
  }
}

export function runEtaxTransmissionEvidenceRecord(opts: {
  from?: string;
  json?: boolean;
}): void {
  try {
    requireCliDataWrite({ command: "etax transmission-test record", permission: "escalate:plan" });
    if (!opts.from || !existsSync(opts.from)) {
      throw new EtaxException({
        code: "ETAX_TRANSMISSION_EVIDENCE_MISSING",
        blocked: "SPEC_BLOCKED",
        message: "etax transmission-test record requires --from <evidence.json>",
      });
    }
    const raw = JSON.parse(readFileSync(opts.from, "utf-8")) as Record<string, unknown>;
    if (raw.kind === "nta_transmission_test_completion") {
      const written = writeNtaCompletionEvidence(raw as never);
      const payload = { ok: true, banner: banner(), ...written, note: "Gate yaml still human-edited" };
      if (opts.json) printJson(payload);
      else console.log(`wrote ${written.path}`);
      return;
    }
    const written = writeTransmissionSubmitEvidence(raw as never);
    const payload = { ok: true, banner: banner(), ...written };
    if (opts.json) printJson(payload);
    else console.log(`wrote ${written.path}`);
  } catch (error) {
    fail(error);
  }
}

export function runEtaxPromoteRho0010(opts: { json?: boolean }): void {
  try {
    requireCliHumanApproval("etax procedure promote");
    const result = promoteRho0010Supported({ actor: resolveCliOperatorId() });
    const payload = { ok: true, banner: banner(), ...result };
    if (opts.json) printJson(payload);
    else console.log(`promoted RHO0010 SUPPORTED at ${result.path}`);
  } catch (error) {
    fail(error);
  }
}

export function runEtaxProductCopySync(opts: { json?: boolean }): void {
  try {
    requireCliHumanApproval("etax product-copy sync");
    const result = syncProductCopyForRho0010({ actor: resolveCliOperatorId() });
    // readiness bump only when D5+D6 already ok (enforced inside sync)
    const readinessPath = pathJoin(getInstallRoot(), "steward/modules/readiness.yaml");
    let readiness = readFs(readinessPath, "utf-8");
    readiness = readiness.replace(
      /jp_etax:\n\s+tier: experimental/,
      "jp_etax:\n    tier: activation_ready",
    );
    writeFs(readinessPath, readiness, "utf-8");
    const payload = { ok: true, banner: banner(), readiness: "activation_ready", ...result };
    if (opts.json) printJson(payload);
    else {
      console.log(`updated ${result.tosPath}`);
      console.log(`updated ${result.commercialPath}`);
      console.log("jp_etax readiness → activation_ready");
    }
  } catch (error) {
    fail(error);
  }
}

export function runEtaxTransmissionTestStatus(opts: { json?: boolean }): void {
  runEtaxProductionReview(opts);
}

export function runEtaxStatus(opts: { id?: string; json?: boolean }): void {
  try {
    if (!opts.id) {
      runEtaxSpecStatus({ json: opts.json });
      return;
    }
    const sub = findSubmission(opts.id) ?? submissionForPackage(opts.id);
    const pkg = findReturnPackage(sub.packageId);
    const payload = {
      ok: true,
      banner: banner(),
      submission: sub,
      package: pkg,
    };
    if (opts.json) printJson(payload);
    else {
      console.log(banner());
      console.log(`${sub.id} status=${sub.status} hash=${sub.contentHash}`);
    }
  } catch (error) {
    fail(error);
  }
}
