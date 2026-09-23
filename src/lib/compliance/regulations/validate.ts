import { existsSync } from "node:fs";
import { getRegulationTemplateAbsPath, getRegulationsCatalogPath } from "../../jurisdiction.js";
import { tenantDocsPath } from "../../tenant.js";
import {
  REGULATIONS_FILE,
  TENANT_REGULATIONS_SUBDIR,
  loadRegulationsCatalog,
  loadTenantRegulationsFile,
} from "./catalog.js";
import { listEffectiveRegulations } from "./effective.js";

export interface RegulationValidationIssue {
  file: string;
  message: string;
}

export function validateRegulations(): RegulationValidationIssue[] {
  const issues: RegulationValidationIssue[] = [];
  const catalog = loadRegulationsCatalog().regulations;
  const catalogById = new Map(catalog.map((regulation) => [regulation.id, regulation]));
  const effectiveById = new Map(
    listEffectiveRegulations().map((regulation) => [regulation.id, regulation])
  );
  const seen = new Set<string>();

  for (const entry of loadTenantRegulationsFile().regulations) {
    if (seen.has(entry.id)) {
      issues.push({ file: REGULATIONS_FILE, message: `duplicate regulation id "${entry.id}"` });
    }
    seen.add(entry.id);
    const catalogRegulation = catalogById.get(entry.id);
    if (!catalogRegulation) {
      issues.push({
        file: REGULATIONS_FILE,
        message: `regulation "${entry.id}" not in catalog (${getRegulationsCatalogPath()})`,
      });
      continue;
    }

    if (!existsSync(getRegulationTemplateAbsPath(catalogRegulation.template))) {
      issues.push({
        file: REGULATIONS_FILE,
        message: `missing template: ${effectiveById.get(entry.id)?.templatePath ?? catalogRegulation.template}`,
      });
    }

    const effective = effectiveById.get(entry.id);
    if (
      entry.enabled &&
      effective?.effective &&
      !existsSync(tenantDocsPath(TENANT_REGULATIONS_SUBDIR, catalogRegulation.tenant_doc))
    ) {
      issues.push({
        file: REGULATIONS_FILE,
        message: `enabled regulation ${entry.id} missing tenant doc: docs/company/regulations/${catalogRegulation.tenant_doc}`,
      });
    }
    if (entry.enabled && effective && !effective.effective && effective.blockReason) {
      issues.push({
        file: REGULATIONS_FILE,
        message: `regulation ${entry.id} enabled but ineffective: ${effective.blockReason} (set enabled: false or enable bind target)`,
      });
    }
  }
  return issues;
}
