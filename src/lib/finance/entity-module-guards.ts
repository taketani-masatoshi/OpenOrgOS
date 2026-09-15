/**
 * Warn when entity_form and enabled modules disagree (corporate vs sole prop).
 */
import { loadTenantConfig } from "../tenant.js";
import { loadEnabledModulesSafe } from "../modules.js";

export function assessEntityModuleMismatches(): string[] {
  const warnings: string[] = [];
  let entity: string | undefined;
  try {
    entity = loadTenantConfig().entity_form;
  } catch {
    return warnings;
  }
  const enabled = loadEnabledModulesSafe().map((m) => m.id);
  if (entity === "sole_proprietorship") {
    if (enabled.includes("jp_tax_corporate")) {
      warnings.push(
        "entity_form=sole_proprietorship だが jp_tax_corporate が有効（法人税経路を誤用しやすい）",
      );
    }
  }
  if (entity === "kk" || entity === "gk" || entity === "yg") {
    if (enabled.includes("jp_sole_proprietor_blue_return")) {
      warnings.push(
        `entity_form=${entity} だが jp_sole_proprietor_blue_return が有効（個人青色を誤用しやすい）`,
      );
    }
  }
  return warnings;
}
