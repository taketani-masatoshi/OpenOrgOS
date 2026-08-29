/**
 * Operator Console — when to show 顧客管理 tab and sub-panels.
 */
import { isRosterAgentActive } from "./agent-roster.js";
import { buildAgentModuleInventory } from "./steward-chat/agent-module-inventory.js";
import { isModuleEnabled } from "./module-business-data.js";

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

export function resolveCustomersNavGate(
  inventory = buildAgentModuleInventory(),
): CustomersNavGate {
  const salesMod = inventory.modules_installed.find((m) => m.id === SALES_MODULE_ID);
  const csMod = inventory.modules_installed.find((m) => m.id === CS_MODULE_ID);
  const sales_module_installed = Boolean(salesMod);
  const customer_success_module_installed = Boolean(csMod);
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
