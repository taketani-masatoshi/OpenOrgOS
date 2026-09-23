import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  etaxProductionGateSchema,
  type EtaxProductionGate,
} from "../../../schemas/etax/production-gate.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { getInstallRoot, getWorkspaceRoot } from "../orgos-paths.js";
import { ETAX_MODULE_ID, ETAX_PRODUCTION_BANNER, ETAX_PRODUCTION_BANNER_CERTIFIED } from "./constants.js";
import { ksk2SpecRegistered } from "./spec-registry.js";
import type { EtaxEnvironment } from "../../../schemas/etax/submission-state.js";

export function etaxProductionGatePath(): string {
  return join(
    getInstallRoot(),
    "steward/jurisdiction-packs/JP/modules",
    ETAX_MODULE_ID,
    "production-gate.yaml"
  );
}

export function loadEtaxProductionGate(): EtaxProductionGate {
  const path = etaxProductionGatePath();
  if (!existsSync(path)) {
    throw etaxError({
      code: "ETAX_PRODUCTION_GATE_MISSING",
      blocked: "PRODUCTION_DISABLED",
      message: `Production gate file missing (fail closed): ${path}`,
    });
  }
  return etaxProductionGateSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

export function productionSubmitBlockedReasons(
  env: EtaxEnvironment,
  gate = loadEtaxProductionGate()
): string[] {
  const reasons: string[] = [];
  if (env !== "production") return reasons;

  const req = gate.requirements;
  if (!gate.production_submission_enabled) {
    reasons.push("production_submission_enabled=false");
  }
  if (!req.ksk2_spec_registered || !ksk2SpecRegistered()) {
    reasons.push("ksk2_spec_registered=false");
  }
  if (!req.xml_schema_validation_proven) reasons.push("xml_schema_validation_proven=false");
  if (!req.integration_tests_passed) reasons.push("integration_tests_passed=false");
  if (!req.nta_transmission_test_completed || !gate.nta_transmission_test.completed) {
    reasons.push("nta_transmission_test_completed=false");
  }
  if (!gate.nta_transmission_test.evidence_path) {
    reasons.push("nta_transmission_test.evidence_path missing");
  } else if (
    !existsSync(join(getWorkspaceRoot(), gate.nta_transmission_test.evidence_path))
  ) {
    reasons.push("nta_transmission_test evidence file missing");
  }
  if (!req.production_credentials_configured) {
    reasons.push("production_credentials_configured=false");
  }
  if (!req.orgos_human_approval_recorded) {
    reasons.push("orgos_human_approval_recorded=false");
  }
  if (!req.production_feature_gate_released) {
    reasons.push("production_feature_gate_released=false");
  }
  if (process.env.ORGOS_ETAX_PRODUCTION === "1" && reasons.length > 0) {
    reasons.push("ORGOS_ETAX_PRODUCTION=1 is ignored; catalog gate is required");
  }
  return reasons;
}

export function assertProductionSubmitAllowed(env: EtaxEnvironment): void {
  const reasons = productionSubmitBlockedReasons(env);
  if (reasons.length === 0) return;
  throw etaxError({
    code: "ETAX_PRODUCTION_DISABLED",
    blocked: "PRODUCTION_DISABLED",
    message: `${ETAX_PRODUCTION_BANNER}: ${reasons.join("; ")}`,
  });
}

export function productionStatusLine(): string {
  const reasons = productionSubmitBlockedReasons("production");
  return reasons.length === 0 ? ETAX_PRODUCTION_BANNER_CERTIFIED : ETAX_PRODUCTION_BANNER;
}
