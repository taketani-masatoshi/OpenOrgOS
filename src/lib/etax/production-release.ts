import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";
import type { EtaxProductionGate } from "../../../schemas/etax/production-gate.js";
import { etaxProductionGateSchema } from "../../../schemas/etax/production-gate.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { findOrgApproval } from "../org/approval/approve.js";
import { getInstallRoot, getWorkspaceRoot } from "../orgos-paths.js";
import {
  etaxProductionGatePath,
  loadEtaxProductionGate,
  productionSubmitBlockedReasons,
} from "./production-gate.js";
import { evaluateProductionEnablement } from "./production-review.js";

export const ETAX_PRODUCTION_ENABLE_SUBJECT = "etax.production_enable";

function requirementsReadyForRelease(gate: EtaxProductionGate): string[] {
  const missing: string[] = [];
  const req = gate.requirements;
  if (!req.ksk2_spec_registered) missing.push("ksk2_spec_registered");
  if (!req.xml_schema_validation_proven) missing.push("xml_schema_validation_proven");
  if (!req.integration_tests_passed) missing.push("integration_tests_passed");
  if (!req.nta_transmission_test_completed || !gate.nta_transmission_test.completed) {
    missing.push("nta_transmission_test_completed");
  }
  if (!gate.nta_transmission_test.evidence_path) {
    missing.push("nta_transmission_test.evidence_path");
  } else if (
    !existsSync(join(getWorkspaceRoot(), gate.nta_transmission_test.evidence_path))
  ) {
    missing.push("nta_transmission_test evidence file missing");
  }
  if (!req.production_credentials_configured) {
    missing.push("production_credentials_configured");
  }
  // orgos_human_approval_recorded is set by release itself after approved APR —
  // do not require it beforehand (avoids chicken-and-egg with yaml edits).
  return missing;
}

/**
 * After ADR 0038 approval (subject etax.production_enable), flip
 * production_submission_enabled + production_feature_gate_released.
 * Does not invent other requirement flags — those must already be true in yaml.
 */
export function releaseProductionSubmission(opts: {
  approvalId: string;
  actor: string;
}): {
  gate: EtaxProductionGate;
  certified: boolean;
  banner: string;
  path: string;
} {
  const approval = findOrgApproval(opts.approvalId);
  if (!approval) {
    throw etaxError({
      code: "ETAX_PRODUCTION_RELEASE_APPROVAL_MISSING",
      blocked: "PRODUCTION_DISABLED",
      message: `Approval ${opts.approvalId} not found`,
    });
  }
  if (approval.status !== "approved") {
    throw etaxError({
      code: "ETAX_PRODUCTION_RELEASE_APPROVAL_NOT_GRANTED",
      blocked: "PRODUCTION_DISABLED",
      message: `Approval ${opts.approvalId} status is ${approval.status}; must be approved`,
    });
  }
  if (approval.subject_type !== ETAX_PRODUCTION_ENABLE_SUBJECT) {
    throw etaxError({
      code: "ETAX_PRODUCTION_RELEASE_SUBJECT_MISMATCH",
      blocked: "PRODUCTION_DISABLED",
      message: `Approval subject_type must be ${ETAX_PRODUCTION_ENABLE_SUBJECT}`,
    });
  }

  const gate = loadEtaxProductionGate();
  const missing = requirementsReadyForRelease(gate);
  if (missing.length > 0) {
    throw etaxError({
      code: "ETAX_PRODUCTION_RELEASE_REQUIREMENTS_INCOMPLETE",
      blocked: "PRODUCTION_DISABLED",
      message: `Cannot release: missing ${missing.join("; ")}. Human must set requirement flags and evidence first.`,
    });
  }

  const next: EtaxProductionGate = etaxProductionGateSchema.parse({
    ...gate,
    production_submission_enabled: true,
    requirements: {
      ...gate.requirements,
      production_feature_gate_released: true,
      orgos_human_approval_recorded: true,
    },
  });

  const path = etaxProductionGatePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${YAML.stringify(next)}\n`, "utf-8");

  const review = evaluateProductionEnablement(next);
  const auditDir = join(getWorkspaceRoot(), "data", "etax");
  mkdirSync(auditDir, { recursive: true });
  const auditLine = JSON.stringify({
    at: new Date().toISOString(),
    actor: opts.actor,
    approvalId: opts.approvalId,
    action: "etax.production.release",
    certified: review.certified,
  });
  writeFileSync(join(auditDir, "production-release.jsonl"), `${auditLine}\n`, {
    flag: "a",
  });

  return {
    gate: next,
    certified: review.certified,
    banner: review.banner,
    path: path.replace(getInstallRoot() + "/", ""),
  };
}

export function productionReleaseBlockedReasons(gate = loadEtaxProductionGate()): string[] {
  return [
    ...requirementsReadyForRelease(gate),
    ...productionSubmitBlockedReasons("production", {
      ...gate,
      production_submission_enabled: true,
      requirements: { ...gate.requirements, production_feature_gate_released: true },
    }).filter((r) => !r.includes("production_submission_enabled") && !r.includes("production_feature_gate")),
  ];
}
