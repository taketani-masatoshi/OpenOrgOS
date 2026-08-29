import { Command } from "commander";
import type { SkillRunOptions } from "../commands/skills.js";
import type { ModuleCliBundle, ModuleCliContext } from "./module-cli-types.js";
import { loadSkillRegistry } from "./skill-registry.js";

export type { ModuleCliBundle, ModuleCliContext } from "./module-cli-types.js";

import { travelBookingCli } from "../../steward/modules/travel_booking/cli/register.js";
import { hospitalityCli } from "../../steward/modules/hospitality/cli/register.js";
import { languageBridgeCli } from "../../steward/modules/language_bridge/cli/register.js";
import { salesCli } from "../../steward/modules/sales/cli/register.js";
import { professional_servicesCli } from "../../steward/modules/professional_services/cli/register.js";
import { saas_subscriptionCli } from "../../steward/modules/saas_subscription/cli/register.js";
import { property_managementCli } from "../../steward/modules/property_management/cli/register.js";
import { software_outsourcingCli } from "../../steward/modules/software_outsourcing/cli/register.js";
import { real_estate_brokerageCli } from "../../steward/modules/real_estate_brokerage/cli/register.js";
import { venture_capitalCli } from "../../steward/modules/venture_capital/cli/register.js";
import { investor_relationsCli } from "../../steward/modules/investor_relations/cli/register.js";
import { customer_successCli } from "../../steward/modules/customer_success/cli/register.js";
import { membershipCli } from "../../steward/modules/membership/cli/register.js";
import { staffingCli } from "../../steward/modules/staffing/cli/register.js";
import { ecommerceCli } from "../../steward/modules/ecommerce/cli/register.js";
import { event_operationsCli } from "../../steward/modules/event_operations/cli/register.js";
import { jp_subsidy_applicationCli } from "../../steward/jurisdiction-packs/JP/modules/jp_subsidy_application/cli/register.js";
import { jp_trademark_applicationCli } from "../../steward/jurisdiction-packs/JP/modules/jp_trademark_application/cli/register.js";
import { jp_corporate_registrationCli } from "../../steward/jurisdiction-packs/JP/modules/jp_corporate_registration/cli/register.js";
import { jp_medical_deviceCli } from "../../steward/jurisdiction-packs/JP/modules/jp_medical_device/cli/register.js";
import { jp_permit_registryCli } from "../../steward/jurisdiction-packs/JP/modules/jp_permit_registry/cli/register.js";
import { jp_bank_corporateCli } from "../../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/register.js";
import { jp_certificationCli } from "../../steward/jurisdiction-packs/JP/modules/jp_certification/cli/register.js";
import { jp_inspectionCli } from "../../steward/jurisdiction-packs/JP/modules/jp_inspection/cli/register.js";
import { jp_minpakuCli } from "../../steward/jurisdiction-packs/JP/modules/jp_minpaku/cli/register.js";
import { jp_permit_applicationCli } from "../../steward/jurisdiction-packs/JP/modules/jp_permit_application/cli/register.js";
import { jp_tax_corporateCli } from "../../steward/jurisdiction-packs/JP/modules/jp_tax_corporate/cli/register.js";
import { jp_tax_consumptionCli } from "../../steward/jurisdiction-packs/JP/modules/jp_tax_consumption/cli/register.js";
import { jp_consumption_refundCli } from "../../steward/jurisdiction-packs/JP/modules/jp_consumption_refund/cli/register.js";
import { jp_invoice_qualifiedCli } from "../../steward/jurisdiction-packs/JP/modules/jp_invoice_qualified/cli/register.js";
import { jp_withholding_statutoryCli } from "../../steward/jurisdiction-packs/JP/modules/jp_withholding_statutory/cli/register.js";
import { jp_payrollCli } from "../../steward/jurisdiction-packs/JP/modules/jp_payroll/cli/register.js";
import { jp_social_insuranceCli } from "../../steward/jurisdiction-packs/JP/modules/jp_social_insurance/cli/register.js";
import { jpCarbonNeutral2050Cli } from "../../steward/jurisdiction-packs/JP/modules/jp_carbon_neutral_2050/cli/register.js";
import { jpPrivacyPolicyCli } from "../../steward/jurisdiction-packs/JP/modules/jp_privacy_policy/cli/register.js";
import { jpWomenEmpowermentCli } from "../../steward/jurisdiction-packs/JP/modules/jp_women_empowerment/cli/register.js";
import { venueBookingCli } from "../../steward/modules/venue_booking/cli/register.js";
import { rentalCli } from "../../steward/modules/rental/cli/register.js";
import { constructionCli } from "../../steward/modules/construction/cli/register.js";
import { logisticsCli } from "../../steward/modules/logistics/cli/register.js";
import { retailStoreCli } from "../../steward/modules/retail_store/cli/register.js";
import { restaurantCli } from "../../steward/modules/restaurant/cli/register.js";
import { clinicCli } from "../../steward/modules/clinic/cli/register.js";
import { educationCli } from "../../steward/modules/education/cli/register.js";
import { eventSpaceCli } from "../../steward/modules/event_space/cli/register.js";
import { pdfEsignCli } from "../../steward/modules/pdf_esign/cli/register.js";

const MODULE_CLI_BUNDLES: ModuleCliBundle[] = [
  travelBookingCli,
  hospitalityCli,
  languageBridgeCli,
  salesCli,
  professional_servicesCli,
  saas_subscriptionCli,
  property_managementCli,
  software_outsourcingCli,
  real_estate_brokerageCli,
  venture_capitalCli,
  investor_relationsCli,
  customer_successCli,
  membershipCli,
  staffingCli,
  ecommerceCli,
  event_operationsCli,
  venueBookingCli,
  rentalCli,
  constructionCli,
  logisticsCli,
  retailStoreCli,
  restaurantCli,
  clinicCli,
  educationCli,
  eventSpaceCli,
  pdfEsignCli,
  jp_subsidy_applicationCli,
  jp_trademark_applicationCli,
  jp_corporate_registrationCli,
  jp_medical_deviceCli,
  jp_permit_registryCli,
  jp_bank_corporateCli,
  jp_certificationCli,
  jp_inspectionCli,
  jp_minpakuCli,
  jp_permit_applicationCli,
  jp_tax_corporateCli,
  jp_tax_consumptionCli,
  jp_consumption_refundCli,
  jp_invoice_qualifiedCli,
  jp_withholding_statutoryCli,
  jp_payrollCli,
  jp_social_insuranceCli,
  jpCarbonNeutral2050Cli,
  jpPrivacyPolicyCli,
  jpWomenEmpowermentCli,
];

export function listModuleCliBundles(): ModuleCliBundle[] {
  return MODULE_CLI_BUNDLES;
}

export interface ModuleCliRegistration {
  moduleId: string;
  /** Command path from the CLI root, e.g. `["operations", "hospitality"]`. */
  rootPath: string[];
  /** Subcommand names directly under `rootPath`. */
  subcommands: string[];
}

/** path (space-joined) → direct child command names */
function snapshotCommandTree(root: Command): Map<string, string[]> {
  const tree = new Map<string, string[]>();
  const walk = (cmd: Command, path: string[]): void => {
    tree.set(
      path.join(" "),
      cmd.commands.map((child) => child.name())
    );
    for (const child of cmd.commands) walk(child, [...path, child.name()]);
  };
  walk(root, []);
  return tree;
}

function collectAddedPaths(before: Map<string, string[]>, after: Map<string, string[]>): string[] {
  const added = new Set<string>();
  for (const [path, children] of after) {
    if (!before.has(path)) {
      added.add(path);
      continue;
    }
    const previous = new Set(before.get(path));
    for (const child of children) {
      if (!previous.has(child)) added.add(`${path} ${child}`.trim());
    }
  }
  return [...added];
}

function isAncestorOrSelf(ancestor: string[], candidate: string[]): boolean {
  return ancestor.every((segment, index) => candidate[index] === segment);
}

/**
 * A bundle may nest its commands (e.g. `jp bank`), so the root is the deepest
 * registered path that shares a branch with every other registered path and
 * still owns subcommands. Leaf commands are therefore never mistaken for roots.
 */
function resolveRootPath(addedPaths: string[], tree: Map<string, string[]>): string[] {
  const paths = addedPaths
    .map((path) => path.split(" ").filter(Boolean))
    .sort((a, b) => a.length - b.length);

  let root = paths[0] ?? [];
  for (const candidate of paths) {
    const onSameBranch = paths.every(
      (other) => isAncestorOrSelf(candidate, other) || isAncestorOrSelf(other, candidate)
    );
    const hasSubcommands = (tree.get(candidate.join(" ")) ?? []).length > 0;
    if (onSameBranch && hasSubcommands && candidate.length > root.length) root = candidate;
  }
  return root;
}

let registrationCache: Map<string, ModuleCliRegistration> | null = null;

/**
 * Introspect the commands each bundle actually registers. Registration is the
 * single source of truth; module manifests declare `cli_commands` as a contract
 * that `orgos modules readiness` verifies against this result.
 */
export function describeModuleCliRegistrations(): Map<string, ModuleCliRegistration> {
  if (registrationCache) return registrationCache;

  const program = new Command().name("orgos").exitOverride();
  const operationsCmd = program.command("operations").description("Corporate operations");
  const ctx: ModuleCliContext = { program, operationsCmd };

  const registrations = new Map<string, ModuleCliRegistration>();
  for (const bundle of MODULE_CLI_BUNDLES) {
    const before = snapshotCommandTree(program);
    bundle.register(ctx);
    const after = snapshotCommandTree(program);

    const rootPath = resolveRootPath(collectAddedPaths(before, after), after);
    registrations.set(bundle.moduleId, {
      moduleId: bundle.moduleId,
      rootPath,
      subcommands: after.get(rootPath.join(" ")) ?? [],
    });
  }

  registrationCache = registrations;
  return registrations;
}

/** Test hook — bundles are static, so the introspection result is memoized. */
export function clearModuleCliRegistrationCache(): void {
  registrationCache = null;
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

let moduleSkillHandlersCache: Record<
  string,
  (opts: SkillRunOptions) => void | Promise<void>
> | null = null;

export function clearModuleSkillHandlersCache(): void {
  moduleSkillHandlersCache = null;
}

export function getModuleSkillHandlers(): Record<
  string,
  (opts: SkillRunOptions) => void | Promise<void>
> {
  if (moduleSkillHandlersCache) return moduleSkillHandlersCache;

  const handlers: Record<string, (opts: SkillRunOptions) => void | Promise<void>> = {};
  const moduleSkills = loadSkillRegistry().filter((skill) => skill.moduleId);
  for (const bundle of MODULE_CLI_BUNDLES) {
    for (const [handlerKey, handler] of Object.entries(bundle.skillHandlers ?? {})) {
      const skill = moduleSkills.find(
        (entry) =>
          entry.moduleId === bundle.moduleId &&
          (entry.id === handlerKey || entry.cli_command === handlerKey)
      );
      const canonicalId = skill?.id ?? handlerKey;
      if (handlers[canonicalId]) throw new Error(`Duplicate module skill handler: ${canonicalId}`);
      handlers[canonicalId] = handler;
    }
  }
  moduleSkillHandlersCache = handlers;
  return handlers;
}

export function resolveModuleSkillHandler(
  canonicalSkillId: string
): ((opts: SkillRunOptions) => void | Promise<void>) | undefined {
  return getModuleSkillHandlers()[canonicalSkillId];
}
