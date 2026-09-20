import { existsSync, readFileSync } from "node:fs";
import { EtaxException } from "../../schemas/etax/errors.js";
import {
  ETAX_COMPATIBILITY_STATUS,
  ETAX_PRODUCTION_BANNER,
  assertProductionSubmitAllowed,
  buildOfficialXml,
  buildReturnPackage,
  currentEtaxSpecVersion,
  findReturnPackage,
  findSubmission,
  loadEtaxProductionGate,
  productionSubmitBlockedReasons,
  specStatusReport,
  submissionForPackage,
  signSubmission,
  validateEtaxDocument,
  fetchAndUnpackEtaxSpecs,
  officialXsdAvailable,
} from "../lib/etax/index.js";
import type { EtaxSignatureProviderId } from "../../schemas/etax/signature.js";
import type { EtaxEnvironment } from "../../schemas/etax/submission-state.js";
import { requireCliDataWrite, requireCliHumanApproval } from "../lib/console-auth/cli-operator.js";
import { resolveCliOperatorId } from "../lib/console-auth/cli-operator.js";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function banner(): string {
  return `${ETAX_PRODUCTION_BANNER}\n${ETAX_COMPATIBILITY_STATUS}`;
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
  for (const row of report.spec.artifacts) {
    const hash = row.sha256 ? row.sha256.slice(0, 12) : "not-retrieved";
    const unpacked = row.unpackedFileCount != null ? ` files=${row.unpackedFileCount}` : "";
    console.log(`- ${row.id}: ${row.status} sha256=${hash}${unpacked}`);
  }
  console.log(`production blockers: ${report.productionBlockers.join("; ") || "(none)"}`);
}

export function runEtaxBuild(opts: { from?: string; json?: boolean }): void {
  try {
    requireCliDataWrite({ command: "etax build", permission: "escalate:plan" });
    if (!opts.from || !existsSync(opts.from)) {
      throw new EtaxException({
        code: "ETAX_BUILD_INPUT_MISSING",
        blocked: "SPEC_BLOCKED",
        message: "etax build requires --from <return-package.json> until official mapper exists",
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
    const result = {
      ok: true,
      banner: banner(),
      package: pkg,
      xml: "SPEC_BLOCKED",
    };
    try {
      buildOfficialXml(pkg.id);
    } catch (error) {
      if (!(error instanceof EtaxException) || error.etax.blocked !== "SPEC_BLOCKED") {
        fail(error);
      }
      if (opts.json) {
        printJson({
          ...result,
          xmlBlocked: error instanceof EtaxException ? error.etax : String(error),
        });
        return;
      }
      console.log(banner());
      console.log(`ReturnPackage ${pkg.id} contentHash=${pkg.contentHash}`);
      console.log(
        officialXsdAvailable()
          ? "Official XML: SPEC_BLOCKED (KSK2 envelope/field mapping not registered)"
          : "Official XML: SPEC_BLOCKED (KSK2 XSD not unpacked)"
      );
      return;
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
    const sub = findSubmission(opts.id) ?? submissionForPackage(opts.id);
    const pkg = findReturnPackage(sub.packageId);
    if (!pkg) {
      throw new EtaxException({
        code: "ETAX_PACKAGE_NOT_FOUND",
        message: `ReturnPackage missing for ${opts.id}`,
      });
    }
    const xml = opts.xml && existsSync(opts.xml) ? readFileSync(opts.xml, "utf-8") : undefined;
    if (opts.xml && xml === undefined) {
      throw new EtaxException({
        code: "ETAX_VALIDATE_XML_MISSING",
        message: `XML file not found: ${opts.xml}`,
      });
    }
    const report = validateEtaxDocument({
      pkg,
      submission: sub,
      env: opts.env ?? "mock",
      xml,
    });
    const payload = {
      ok: report.ok,
      banner: banner(),
      submissionId: sub.id,
      status: sub.status,
      contentHash: pkg.contentHash,
      layers: Object.fromEntries(
        report.layers.map((row) => [row.layer, { status: row.status, note: row.detail }])
      ),
    };
    if (opts.json) printJson(payload);
    else {
      console.log(banner());
      console.log(`submission ${sub.id} status=${sub.status}`);
      for (const row of report.layers) {
        console.log(`Layer ${row.layer}: ${row.status} — ${row.detail}`);
      }
    }
    if (report.layers.some((row) => row.status === "fail")) {
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

export function runEtaxApprove(_opts: { id: string; json?: boolean }): void {
  try {
    requireCliHumanApproval("etax approve");
    throw new EtaxException({
      code: "ETAX_APPROVE_PHASE_BLOCKED",
      blocked: "PHASE_NOT_IMPLEMENTED",
      message: "Org approval binding is Phase 6. Hash-bound approval is not yet wired.",
    });
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

export function runEtaxSubmit(opts: { id: string; env: EtaxEnvironment; json?: boolean }): void {
  try {
    if (opts.env === "production") {
      assertProductionSubmitAllowed("production");
    }
    requireCliHumanApproval("etax submit");
    throw new EtaxException({
      code: "ETAX_SUBMIT_PHASE_BLOCKED",
      blocked: "PHASE_NOT_IMPLEMENTED",
      message: `Transport is Phase 4. env=${opts.env}. ${ETAX_PRODUCTION_BANNER}`,
    });
  } catch (error) {
    fail(error);
  }
}

export function runEtaxReceipt(_opts: { id: string; json?: boolean }): void {
  try {
    throw new EtaxException({
      code: "ETAX_RECEIPT_PHASE_BLOCKED",
      blocked: "PHASE_NOT_IMPLEMENTED",
      message: "Receipt adapter is Phase 5.",
    });
  } catch (error) {
    fail(error);
  }
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
