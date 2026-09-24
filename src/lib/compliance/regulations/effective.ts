import type { CatalogRegulation, RegulationBind } from "../../../../schemas/regulations-catalog.js";
import { getRegulationTemplateRelPath } from "../../jurisdiction.js";
import { loadModulesFile } from "../../modules.js";
import { loadEnabledIsoIds } from "../../tenant-standards.js";
import { loadRegulationsCatalog, loadTenantRegulationsFile } from "./catalog.js";

export interface EffectiveRegulation {
  id: string;
  name: string;
  tenantEnabled: boolean;
  effective: boolean;
  catalog: CatalogRegulation;
  tenantDocPath: string;
  templatePath: string;
  blockReason?: string;
}

function isModuleEnabled(moduleId: string): boolean {
  return loadModulesFile().modules.some(
    (module) => module.enabled && (module.id === moduleId || module.agent === moduleId)
  );
}

export function isBindSatisfied(bind: RegulationBind, enabledIso: string[]): boolean {
  switch (bind.type) {
    case "core":
      return bind.group === "governance" || enabledIso.length > 0;
    case "iso":
      return enabledIso.includes(bind.iso_id);
    case "iso_any":
      return bind.iso_ids.some((id) => enabledIso.includes(id));
    case "module":
      return isModuleEnabled(bind.module_id);
    default:
      return false;
  }
}

function describeBindBlock(bind: RegulationBind): string {
  switch (bind.type) {
    case "iso":
      return `ISO ${bind.iso_id} が無効`;
    case "iso_any":
      return `いずれの ISO (${bind.iso_ids.join(", ")}) も無効`;
    case "module":
      return `モジュール ${bind.module_id} が無効`;
    case "core":
      return bind.group === "ms" ? "有効 ISO なし" : "—";
    default:
      return "bind 未充足";
  }
}

export function listEffectiveRegulations(): EffectiveRegulation[] {
  const catalog = loadRegulationsCatalog().regulations;
  const tenantById = new Map(
    loadTenantRegulationsFile().regulations.map((regulation) => [regulation.id, regulation])
  );
  const enabledIso = loadEnabledIsoIds();
  return catalog.map((catalogRegulation) => {
    const tenantEnabled = tenantById.get(catalogRegulation.id)?.enabled ?? false;
    const bindSatisfied = isBindSatisfied(catalogRegulation.binds_to, enabledIso);
    return {
      id: catalogRegulation.id,
      name: catalogRegulation.name,
      tenantEnabled,
      effective: tenantEnabled && bindSatisfied,
      catalog: catalogRegulation,
      tenantDocPath: `docs/company/regulations/${catalogRegulation.tenant_doc}`,
      templatePath: getRegulationTemplateRelPath(catalogRegulation.template),
      blockReason:
        tenantEnabled && !bindSatisfied ? describeBindBlock(catalogRegulation.binds_to) : undefined,
    };
  });
}

export function loadEnabledRegulationIds(): string[] {
  return listEffectiveRegulations()
    .filter((regulation) => regulation.effective)
    .map((regulation) => regulation.id);
}
