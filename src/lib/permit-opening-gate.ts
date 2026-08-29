/**
 * G-01 opening gate — Required Compliance vs fulfilment SSOT (ADR 0012).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { permitRegistryFileSchema } from "../../schemas/jp-permit-registry.js";
import { listActiveCertTypeIds } from "./certification-workflow.js";
import { listSatisfiedInspectionTypeIds } from "./inspection-workflow.js";
import { getModuleDataDir } from "./module-business-data.js";
import {
  listCertificationGateGroups,
  listInspectionGateGroups,
  listLicenseGateGroups,
  listRegistrationGateGroups,
  loadRequiredComplianceFile,
} from "./required-compliance.js";
import { loadEnabledModules } from "./modules.js";

/** Deprecated fallback when required-compliance.yaml is absent. */
export const MODULE_REQUIRED_PERMIT_ANY_OF: Record<string, string[]> = {
  jp_minpaku: ["pt-minpaku-notification"],
  hospitality: [
    "pt-ryokan-hotel",
    "pt-ryokan-ryokan",
    "pt-ryokan-shukuhaku",
    "pt-ryokan-geshuku",
  ],
};

export type PermitOpeningBlocker = {
  id: string;
  module_id: string;
  requirement_id: string;
  title: string;
  detail: string;
  required_any_of: string[];
  fulfilment?: "license" | "certification" | "inspection" | "registration";
  /** Ledger statuses found for the required types — empty when nothing is registered. */
  found_statuses?: Array<{ permit_type_id: string; status: string }>;
};

function loadActivePermitTypeIds(): Set<string> {
  try {
    const path = join(getModuleDataDir("jp_permit_registry"), "permit-registry.yaml");
    if (!existsSync(path)) return new Set();
    const doc = permitRegistryFileSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
    return new Set(
      doc.permits.filter((p) => p.status === "active").map((p) => p.permit_type_id),
    );
  } catch {
    return new Set();
  }
}

function groupSatisfied(
  fulfilment: "license" | "certification" | "inspection" | "registration",
  match: "any_of" | "all_of",
  typeIds: string[],
  activePermits: Set<string>,
  activeCerts: Set<string>,
  satisfiedInspections: Set<string>,
): boolean {
  const pool =
    fulfilment === "license" || fulfilment === "registration"
      ? activePermits
      : fulfilment === "certification"
        ? activeCerts
        : satisfiedInspections;
  if (match === "all_of") return typeIds.every((id) => pool.has(id));
  return typeIds.some((id) => pool.has(id));
}

function blockersFromDeclaration(moduleId: string): Omit<PermitOpeningBlocker, "id">[] {
  const file = loadRequiredComplianceFile(moduleId);
  if (!file) {
    const fallback = MODULE_REQUIRED_PERMIT_ANY_OF[moduleId];
    if (!fallback?.length) return [];
    const activePermits = loadActivePermitTypeIds();
    if (fallback.some((id) => activePermits.has(id))) return [];
    return [
      {
        module_id: moduleId,
        requirement_id: "fallback-any-of",
        title: `${moduleId}: required permit missing`,
        detail: `Activate at least one permit type: ${fallback.join(", ")}`,
        required_any_of: [...fallback],
        fulfilment: "license",
      },
    ];
  }

  const activePermits = loadActivePermitTypeIds();
  const activeCerts = listActiveCertTypeIds();
  const satisfiedInspections = listSatisfiedInspectionTypeIds();
  const blockers: Omit<PermitOpeningBlocker, "id">[] = [];

  for (const req of file.requirements.filter((r) => r.severity === "required")) {
    if (req.fulfilment === "license") {
      const groups = listLicenseGateGroups(moduleId).filter((g) => g.requirement_id === req.id);
      for (const g of groups) {
        if (
          groupSatisfied("license", g.match, g.permit_type_ids, activePermits, activeCerts, satisfiedInspections)
        ) {
          continue;
        }
        blockers.push({
          module_id: moduleId,
          requirement_id: g.requirement_id,
          title: `${moduleId}: ${req.id} (license)`,
          detail: g.legal_basis
            ? `${g.legal_basis} — ${g.authority_ja ?? "authority TBD"}`
            : `Required permit types: ${g.permit_type_ids.join(", ")}`,
          required_any_of: [...g.permit_type_ids],
          fulfilment: "license",
        });
      }
      continue;
    }
    if (req.fulfilment === "registration") {
      const groups = listRegistrationGateGroups(moduleId).filter((g) => g.requirement_id === req.id);
      for (const g of groups) {
        if (
          groupSatisfied(
            "registration",
            g.match,
            g.permit_type_ids,
            activePermits,
            activeCerts,
            satisfiedInspections,
          )
        ) {
          continue;
        }
        blockers.push({
          module_id: moduleId,
          requirement_id: g.requirement_id,
          title: `${moduleId}: ${req.id} (registration)`,
          detail: g.legal_basis
            ? `${g.legal_basis} — ${g.authority_ja ?? "authority TBD"}`
            : `Required registration types: ${g.permit_type_ids.join(", ")}`,
          required_any_of: [...g.permit_type_ids],
          fulfilment: "registration",
        });
      }
      continue;
    }
    if (req.fulfilment === "certification") {
      const groups = listCertificationGateGroups(moduleId).filter((g) => g.requirement_id === req.id);
      for (const g of groups) {
        if (
          groupSatisfied(
            "certification",
            g.match,
            g.type_ids,
            activePermits,
            activeCerts,
            satisfiedInspections,
          )
        ) {
          continue;
        }
        blockers.push({
          module_id: moduleId,
          requirement_id: g.requirement_id,
          title: `${moduleId}: ${req.id} (certification)`,
          detail: `Required certification types: ${g.type_ids.join(", ")}`,
          required_any_of: [...g.type_ids],
          fulfilment: "certification",
        });
      }
      continue;
    }
    if (req.fulfilment === "inspection") {
      const groups = listInspectionGateGroups(moduleId).filter((g) => g.requirement_id === req.id);
      for (const g of groups) {
        if (
          groupSatisfied(
            "inspection",
            g.match,
            g.type_ids,
            activePermits,
            activeCerts,
            satisfiedInspections,
          )
        ) {
          continue;
        }
        blockers.push({
          module_id: moduleId,
          requirement_id: g.requirement_id,
          title: `${moduleId}: ${req.id} (inspection)`,
          detail: `Required inspection types: ${g.type_ids.join(", ")}`,
          required_any_of: [...g.type_ids],
          fulfilment: "inspection",
        });
      }
    }
  }

  return blockers;
}

export function listPermitOpeningBlockers(opts?: { moduleId?: string }): PermitOpeningBlocker[] {
  const moduleIds = opts?.moduleId
    ? [opts.moduleId]
    : loadEnabledModules().map((m) => m.id);
  const raw: Omit<PermitOpeningBlocker, "id">[] = [];
  for (const moduleId of moduleIds) {
    raw.push(...blockersFromDeclaration(moduleId));
  }
  return raw.map((b, i) => ({
    ...b,
    id: `PERMIT-GATE-${String(i + 1).padStart(3, "0")}`,
  }));
}
