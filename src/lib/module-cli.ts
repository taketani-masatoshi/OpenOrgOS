import type { Command } from "commander";
import type { SkillRunOptions } from "../commands/skills.js";
import type { ModuleCliBundle, ModuleCliContext } from "./module-cli-types.js";

export type { ModuleCliBundle, ModuleCliContext } from "./module-cli-types.js";

import { travelBookingCli } from "../../steward/modules/travel_booking/cli/register.js";
import { hospitalityCli } from "../../steward/modules/hospitality/cli/register.js";
import { languageBridgeCli } from "../../steward/modules/language_bridge/cli/register.js";
import { professional_servicesCli } from "../../steward/modules/professional_services/cli/register.js";
import { saas_subscriptionCli } from "../../steward/modules/saas_subscription/cli/register.js";
import { property_managementCli } from "../../steward/modules/property_management/cli/register.js";
import { software_outsourcingCli } from "../../steward/modules/software_outsourcing/cli/register.js";
import { real_estate_brokerageCli } from "../../steward/modules/real_estate_brokerage/cli/register.js";
import { venture_capitalCli } from "../../steward/modules/venture_capital/cli/register.js";
import { membershipCli } from "../../steward/modules/membership/cli/register.js";
import { staffingCli } from "../../steward/modules/staffing/cli/register.js";
import { ecommerceCli } from "../../steward/modules/ecommerce/cli/register.js";
import { event_operationsCli } from "../../steward/modules/event_operations/cli/register.js";
import { jp_subsidy_applicationCli } from "../../steward/jurisdiction-packs/JP/modules/jp_subsidy_application/cli/register.js";
import { jp_trademark_applicationCli } from "../../steward/jurisdiction-packs/JP/modules/jp_trademark_application/cli/register.js";
import { jp_corporate_registrationCli } from "../../steward/jurisdiction-packs/JP/modules/jp_corporate_registration/cli/register.js";

const MODULE_CLI_BUNDLES: ModuleCliBundle[] = [
  travelBookingCli,
  hospitalityCli,
  languageBridgeCli,
  professional_servicesCli,
  saas_subscriptionCli,
  property_managementCli,
  software_outsourcingCli,
  real_estate_brokerageCli,
  venture_capitalCli,
  membershipCli,
  staffingCli,
  ecommerceCli,
  event_operationsCli,
  jp_subsidy_applicationCli,
  jp_trademark_applicationCli,
  jp_corporate_registrationCli,
];

export function listModuleCliBundles(): ModuleCliBundle[] {
  return MODULE_CLI_BUNDLES;
}

/** Register `operations` and all module subcommands on the root program. */
export function registerModuleCli(program: Command): Command {
  const operationsCmd = program
    .command("operations")
    .description("Corporate operations — module CLI (travel · records · business modules · …)");

  const ctx: ModuleCliContext = { program, operationsCmd };
  for (const bundle of MODULE_CLI_BUNDLES) {
    bundle.register(ctx);
  }
  return operationsCmd;
}

export function resolveModuleSkillHandler(
  skillCommandId: string
): ((opts: SkillRunOptions) => void | Promise<void>) | undefined {
  for (const bundle of MODULE_CLI_BUNDLES) {
    const handler = bundle.skillHandlers?.[skillCommandId];
    if (handler) return handler;
  }
  return undefined;
}
