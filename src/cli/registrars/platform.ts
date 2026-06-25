import type { Command } from "commander";
import {
  runModulesList,
  runModulesSyncContext,
  runModulesCheck,
  runModulesCheckAll,
} from "../../commands/modules.js";
import { runMapList, runMapResolve, runMapTree } from "../../commands/map.js";
import { runPipelineDaily, runPipelineList, runPipelineWeekly } from "../../commands/pipeline.js";
import { runTenantInitCommand } from "../../commands/tenant.js";
import {
  runRegulationsList,
  runRegulationsEffective,
  runRegulationsSeed,
} from "../../commands/regulations.js";
import { runStandardsList, runStandardsEnabled } from "../../commands/standards.js";
import { runOpsDaily, runOpsP0 } from "../../commands/ops.js";
import { runSkillsList, runSkill } from "../../commands/skills.js";
import { registerModuleCli } from "../../lib/module-cli.js";
import {
  runJurisdictionCheck,
  runJurisdictionEntityForms,
  runJurisdictionList,
  runJurisdictionCountries,
  runJurisdictionShow,
  runJurisdictionPacksCheck,
  runJurisdictionPacksList,
  runLocaleList,
  runLocaleShow,
} from "../../commands/locale-jurisdiction.js";

export function registerPlatformCommands(program: Command): void {
  const modulesCmd = program
    .command("modules")
    .description("Business module catalog and tenant bindings");

  modulesCmd.command("list").description("List steward/modules catalog vs tenant modules.yaml").action(runModulesList);
  modulesCmd
    .command("sync-context")
    .description("Regenerate active_context.md and tenant-active-context.mdc")
    .action(runModulesSyncContext);
  modulesCmd
    .command("check [id]")
    .description("Verify module manifest seeds exist (no tenant data required)")
    .option("--all", "Check all catalog modules (production_ready: full · seed_only: skeleton)")
    .action((id: string | undefined, opts: { all?: boolean }) => {
      if (opts.all) {
        runModulesCheckAll();
        return;
      }
      if (!id) {
        console.error("Provide a module id or use --all");
        process.exit(1);
      }
      runModulesCheck(id);
    });

  const mapCmd = program.command("map").description("Logical → physical path map (tenant · framework)");
  mapCmd.command("list").description("List common logical paths for active tenant").action(runMapList);
  mapCmd.command("resolve <path>").description("Resolve one logical path (e.g. data/company.yaml)").action(runMapResolve);
  mapCmd.command("tree").description("Tenant map tree (enabled modules · dependency-graph nodes)").action(runMapTree);

  const pipelineCmd = program.command("pipeline").description("Automation pipelines (Cursor-external)");
  pipelineCmd.command("list").description("List available pipelines").action(runPipelineList);
  pipelineCmd
    .command("run <name>")
    .description("Run a pipeline (daily | weekly)")
    .option("--tenant <id>", "Tenant id")
    .option("--skip-validate", "Skip validate step")
    .action((name, opts) => {
      if (name === "daily") {
        runPipelineDaily({ tenant: opts.tenant, skipValidate: opts.skipValidate });
        return;
      }
      if (name === "weekly") {
        runPipelineWeekly({ tenant: opts.tenant, skipValidate: opts.skipValidate });
        return;
      }
      console.error(`Unknown pipeline: ${name}`);
      process.exit(1);
    });

  const tenantCmd = program.command("tenant").description("Tenant instance management");
  tenantCmd
    .command("init <id>")
    .description("Initialize tenant from _template with skeleton data")
    .option("--name <name>", "Display / legal name")
    .option("--from <modules...>", "Enable only these modules (e.g. rental)")
    .option("--jurisdiction <code>", "Legal jurisdiction pack (JP | US | SG | EE | HK)")
    .option("--entity-form <form>", "Entity form (kk | c_corp)")
    .option("--display-language <code>", "Display language (ja | en | zh-Hant | zh-Hans | et)")
    .option("--legal-subdivision <code>", "Legal subdivision (e.g. DE for Delaware under US)")
    .option("--force", "Overwrite existing tenant directory")
    .option("--no-validate", "Skip validate after init")
    .action((id, opts) =>
      runTenantInitCommand(id, {
        name: opts.name,
        from: opts.from,
        force: opts.force,
        validate: opts.validate,
        jurisdiction: opts.jurisdiction,
        entityForm: opts.entityForm,
        displayLanguage: opts.displayLanguage,
        legalSubdivision: opts.legalSubdivision,
      })
    );

  const localeCmd = program.command("locale").description("Display language (independent from legal jurisdiction)");
  localeCmd.command("list").description("List supported display languages").action(runLocaleList);
  localeCmd.command("show").description("Show resolved display locale for active tenant").action(runLocaleShow);

  const jurisdictionCmd = program.command("jurisdiction").description("Legal jurisdiction packs");
  jurisdictionCmd
    .command("countries")
    .description("List jurisdiction countries (ISO 3166-1 alpha-2)")
    .option("--all", "Include stub-tier countries")
    .action((opts: { all?: boolean }) => runJurisdictionCountries(opts.all));
  jurisdictionCmd.command("list").description("List full-tier jurisdiction packs").action(runJurisdictionList);
  jurisdictionCmd.command("show").description("Show resolved legal jurisdiction for active tenant").action(runJurisdictionShow);
  jurisdictionCmd
    .command("entity-forms <code>")
    .description("List selectable entity forms for a jurisdiction")
    .option("--subdivision <code>", "Legal subdivision (e.g. DE for Delaware)")
    .action((code: string, opts: { subdivision?: string }) =>
      runJurisdictionEntityForms(code, opts.subdivision)
    );
  jurisdictionCmd
    .command("check [code]")
    .description("Verify jurisdiction pack catalog exists")
    .action((code: string | undefined) => runJurisdictionCheck(code));

  const packsCmd = jurisdictionCmd.command("packs").description("Installed jurisdiction pack pins (OSS)");
  packsCmd.command("list").description("List packs.lock.yaml pins").action(runJurisdictionPacksList);
  packsCmd
    .command("check [code]")
    .description("Verify pack manifest, templates, and pack modules")
    .action((code: string | undefined) => runJurisdictionPacksCheck(code));

  const regulationsCmd = program.command("regulations").description("Regulation catalog and tenant effective docs");
  regulationsCmd.command("list").description("List catalog vs tenant regulations").action(runRegulationsList);
  regulationsCmd.command("effective").description("List effective regulation IDs").action(runRegulationsEffective);
  regulationsCmd
    .command("seed")
    .description("Copy effective regulation templates to docs/company/regulations/")
    .option("--force", "Overwrite existing tenant docs")
    .option("--dry-run", "Print what would be seeded")
    .option("--id <regId>", "Seed single regulation (repeatable)", (v: string, prev: string[]) => [...prev, v], [])
    .action((opts) =>
      runRegulationsSeed({
        force: opts.force,
        dryRun: opts.dryRun,
        ids: opts.id?.length ? opts.id : undefined,
      })
    );

  const standardsCmd = program.command("standards").description("ISO standards catalog");
  standardsCmd.command("list").description("List ISO catalog vs tenant standards.yaml").action(runStandardsList);
  standardsCmd.command("enabled").description("List enabled ISO standard IDs").action(runStandardsEnabled);

  const opsCmd = program.command("ops").description("Operational daily checks (P0 · contracts · maturity)");
  opsCmd.command("daily").description("Daily ops summary (maturity + P0 + contract alerts)").action(runOpsDaily);
  opsCmd.command("p0").description("P0 closing blockers only (exit 1 if open)").action(runOpsP0);

  registerModuleCli(program);

  const skillsCmd = program.command("skills").description("Run Agent Skills from CLI (no Cursor)");
  skillsCmd.command("list").description("List skill CLI commands").action(runSkillsList);
  skillsCmd
    .command("run <id>")
    .description("Run skill: contract-expiry | permit-expiry | monthly-close | variance | records-check | p0 | daily")
    .option("-d, --days <number>", "Days ahead (contract-expiry)", "90")
    .option("-m, --month <YYYY-MM>", "Target month (monthly-close)")
    .option("--markdown", "Markdown output where supported")
    .option("-o, --output <filename>", "Save report under docs/reports/")
    .action((id, opts) =>
      runSkill(id, {
        days: opts.days ? parseInt(opts.days, 10) : undefined,
        month: opts.month,
        markdown: opts.markdown,
        output: opts.output,
      })
    );
}
