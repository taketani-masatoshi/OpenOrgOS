/**
 * Catalog-side regulation↔module contract (no Work Order / escalate imports).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getRegulationsTemplatesDir } from "./jurisdiction.js";
import { loadModuleManifest } from "./modules.js";
import { loadRegulationsCatalog } from "./regulations.js";

/** Pack-level family registry (cousins that must fork, not merge). */
export const REGULATION_FAMILIES: Record<
  string,
  {
    sourceRegs: readonly string[];
    ownerModuleIds: readonly string[];
    moduleIdHint: RegExp;
    draftTemplate: string;
  }
> = {
  qms_gxp: {
    sourceRegs: ["REG-025", "REG-026"],
    ownerModuleIds: ["jp_medical_device"],
    moduleIdHint: /cosmetic|化粧品|quasi.?drug|医薬部外|otc.?drug|general.?drug/i,
    draftTemplate: "by-module/_families/qms-gxp/FORK-DRAFT.md",
  },
};

export function checkModuleRegulationContract(
  catalogId: string
): { moduleId: string; message: string }[] {
  const issues: { moduleId: string; message: string }[] = [];
  const manifest = loadModuleManifest(catalogId);
  if (!manifest) return issues;

  const catalogIds = new Set(loadRegulationsCatalog().regulations.map((r) => r.id));
  for (const id of [
    ...(manifest.required_regulations ?? []),
    ...(manifest.optional_regulations ?? []),
  ]) {
    if (!catalogIds.has(id)) {
      issues.push({
        moduleId: catalogId,
        message: `regulation reference ${id} not in JP catalog`,
      });
    }
  }

  const fam = manifest.regulation_family;
  if (fam?.id && !REGULATION_FAMILIES[fam.id]) {
    issues.push({
      moduleId: catalogId,
      message: `unknown regulation_family.id "${fam.id}" (known: ${Object.keys(REGULATION_FAMILIES).join(", ")})`,
    });
  }
  for (const id of fam?.do_not_mutate ?? []) {
    if (!catalogIds.has(id)) {
      issues.push({
        moduleId: catalogId,
        message: `regulation_family.do_not_mutate ${id} not in JP catalog`,
      });
    }
  }

  const famDef = fam?.id ? REGULATION_FAMILIES[fam.id] : undefined;
  const ownerFam = Object.values(REGULATION_FAMILIES).find((f) =>
    f.ownerModuleIds.includes(catalogId)
  );
  const scaffold = famDef?.draftTemplate ?? ownerFam?.draftTemplate;
  if (scaffold) {
    const abs = join(getRegulationsTemplatesDir(), scaffold);
    if (!existsSync(abs)) {
      issues.push({
        moduleId: catalogId,
        message: `missing family draft scaffold: ${scaffold}`,
      });
    }
  }

  const requiredEmpty = !(manifest.required_regulations?.length);
  const optionalEmpty = !(manifest.optional_regulations?.length);
  const intentionalNone = /規程不要|no regulations|regs?:\s*none/i.test(manifest.notes ?? "");
  const moneyish =
    /bank|payroll|tax|invoice|refund|permit|privacy|social.?insurance|medical_device/i.test(
      catalogId
    );
  if (
    moneyish &&
    requiredEmpty &&
    optionalEmpty &&
    !manifest.regulation_family &&
    !intentionalNone
  ) {
    issues.push({
      moduleId: catalogId,
      message:
        "cash/PII/permit-like module missing required_regulations / optional_regulations / regulation_family (or notes declaring 規程不要)",
    });
  }

  return issues;
}
