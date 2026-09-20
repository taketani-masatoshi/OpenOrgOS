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
} from "../lib/etax/index.js";
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
  for (const row of report.spec.artifacts) {
    const hash = row.sha256 ? row.sha256.slice(0, 12) : "not-retrieved";
    console.log(`- ${row.id}: ${row.status} sha256=${hash}`);
  }
  console.log(`production blockers: ${report.productionBlockers.join("; ") || "(none)"}`);
}

export function runEtaxBuild(opts: {
  from?: string;
  json?: boolean;
}): void {
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
      if (opts.json) {
        printJson({
          ...result,
          xmlBlocked: error instanceof EtaxException ? error.etax : String(error),
        });
        return;
      }
      console.log(banner());
      console.log(`ReturnPackage ${pkg.id} contentHash=${pkg.contentHash}`);
      console.log("Official XML: SPEC_BLOCKED (KSK2 XSD not unpacked)");
      return;
    }
  } catch (error) {
    fail(error);
  }
}

export function runEtaxValidate(opts: { id: string; json?: boolean }): void {
  try {
    const sub = findSubmission(opts.id) ?? submissionForPackage(opts.id);
    const pkg = findReturnPackage(sub.packageId);
    const payload = {
      ok: false,
      banner: banner(),
      submissionId: sub.id,
      status: sub.status,
      contentHash: pkg?.contentHash,
      layers: {
        structural: { status: "SPEC_BLOCKED", note: "Official XSD not registered locally" },
        specification: { status: "SPEC_BLOCKED", note: "Procedure/form matrix empty until 手続一覧 unpacked" },
        orgos: { status: sub.status === "DRAFT" ? "partial" : sub.status, note: "hash + state only (Phase 1)" },
      },
    };
    if (opts.json) printJson(payload);
    else {
      console.log(banner());
      console.log(`submission ${sub.id} status=${sub.status}`);
      console.log("Layer 1/2 validation: SPEC_BLOCKED");
    }
  } catch (error) {
    fail(error);
  }
}

export function runEtaxApprove(opts: { id: string; json?: boolean }): void {
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

export function runEtaxSign(opts: { id: string; json?: boolean }): void {
  try {
    requireCliDataWrite({ command: "etax sign", permission: "chat:approve" });
    throw new EtaxException({
      code: "ETAX_SIGN_PHASE_BLOCKED",
      blocked: "PHASE_NOT_IMPLEMENTED",
      message: "Signature adapter is Phase 3.",
    });
  } catch (error) {
    fail(error);
  }
}

export function runEtaxSubmit(opts: {
  id: string;
  env: EtaxEnvironment;
  json?: boolean;
}): void {
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

export function runEtaxReceipt(opts: { id: string; json?: boolean }): void {
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
