/**
 * Operator Console — when to show 顧客管理 tab and sub-panels.
 *
 * Must stay cheap: BudgetAuthGate awaits `/chat/v1/customers/nav` on every
 * login. Do not call buildAgentModuleInventory() here — that walks readiness
 * for every installed module (~seconds on mal).
 */
import { isRosterAgentActive } from "./agent-roster.js";
import { isModuleEnabled } from "./module-business-data.js";
import { loadModulesFileSafe } from "./modules.js";

export const SALES_MODULE_ID = "sales";
export const CS_MODULE_ID = "customer_success";

const SALES_AGENT_IDS = ["sales_lead", "sales_outbound", "sales_inbound"] as const;

export interface CustomersNavGate {
  show_tab: boolean;
  sales_enabled: boolean;
  customer_success_enabled: boolean;
  sales_module_installed: boolean;
  customer_success_module_installed: boolean;
  /** Legacy: sales agents On but sales module not imported yet — show tab with import hint. */
  sales_agent_grace: boolean;
}

export function resolveCustomersNavGate(): CustomersNavGate {
  const tenantModules = loadModulesFileSafe().modules;
  const sales_module_installed = tenantModules.some((m) => m.id === SALES_MODULE_ID);
  const customer_success_module_installed = tenantModules.some(
    (m) => m.id === CS_MODULE_ID,
  );
  const sales_enabled = isModuleEnabled(SALES_MODULE_ID);
  const customer_success_enabled = isModuleEnabled(CS_MODULE_ID);
  const sales_agent_grace =
    !sales_module_installed &&
    SALES_AGENT_IDS.some((id) =>
      isRosterAgentActive(id, { profile: "operational" }),
    );
  const show_tab =
    sales_enabled || customer_success_enabled || sales_agent_grace;
  return {
    show_tab,
    sales_enabled,
    customer_success_enabled,
    sales_module_installed,
    customer_success_module_installed,
    sales_agent_grace,
  };
}
