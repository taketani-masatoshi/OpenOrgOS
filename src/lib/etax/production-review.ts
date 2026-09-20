import type { EtaxProductionGate } from "../../../schemas/etax/production-gate.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { ETAX_PRODUCTION_BANNER } from "./constants.js";
import {
  loadEtaxProductionGate,
  productionSubmitBlockedReasons,
} from "./production-gate.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getWorkspaceRoot } from "../orgos-paths.js";

export function transmissionTestEvidencePresent(gate = loadEtaxProductionGate()): boolean {
  const path = gate.nta_transmission_test.evidence_path;
  if (!path) return false;
  return existsSync(join(getWorkspaceRoot(), path));
}

/**
 * Single source of truth for production readiness display.
 * certified is derived — never hard-coded true.
 */
export function evaluateProductionEnablement(gate = loadEtaxProductionGate()): {
  banner: string;
  production_submission_enabled: boolean;
  certified: boolean;
  blockers: string[];
  requirements: EtaxProductionGate["requirements"];
  nta_transmission_test: EtaxProductionGate["nta_transmission_test"] & {
    evidence_present: boolean;
  };
} {
  const blockers = productionSubmitBlockedReasons("production", gate);
  const evidencePresent = transmissionTestEvidencePresent(gate);
  const req = gate.requirements;
  const allRequirements =
    gate.production_submission_enabled &&
    req.ksk2_spec_registered &&
    req.xml_schema_validation_proven &&
    req.integration_tests_passed &&
    req.nta_transmission_test_completed &&
    req.production_credentials_configured &&
    req.orgos_human_approval_recorded &&
    req.production_feature_gate_released &&
    gate.nta_transmission_test.completed &&
    evidencePresent &&
    blockers.length === 0;

  return {
    banner: ETAX_PRODUCTION_BANNER,
    production_submission_enabled: gate.production_submission_enabled && allRequirements,
    certified: allRequirements,
    blockers,
    requirements: gate.requirements,
    nta_transmission_test: {
      ...gate.nta_transmission_test,
      evidence_present: evidencePresent,
    },
  };
}

export function assertProductionEnableRefused(gate = loadEtaxProductionGate()): never {
  const review = evaluateProductionEnablement(gate);
  throw etaxError({
    code: "ETAX_PRODUCTION_ENABLE_REFUSED",
    blocked: "PRODUCTION_DISABLED",
    message:
      `${ETAX_PRODUCTION_BANNER}. CLI cannot flip production-gate.yaml. ` +
      `Blockers: ${review.blockers.join("; ") || "(none — human must edit catalog gate)"}`,
  });
}
