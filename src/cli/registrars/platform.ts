import type { Command } from "commander";
import {
  runModulesList,
  runModulesSyncContext,
  runModulesCheck,
  runModulesCheckAll,
  runModulesActivate,
  runModulesScaffoldDocs,
  runModulesReadiness,
} from "../../commands/modules.js";
import { runTenantScaffoldDocs } from "../../commands/tenant-scaffold-docs.js";
import { runMapList, runMapResolve, runMapTree } from "../../commands/map.js";
import { runPipelineDaily, runPipelineList, runPipelineWeekly } from "../../commands/pipeline.js";
import { runTenantInitCommand, runTenantScaffoldData, runTenantAlignClassification } from "../../commands/tenant.js";
import {
  runRegulationsList,
  runRegulationsEffective,
  runRegulationsSeed,
  runRegulationsInit,
} from "../../commands/regulations.js";
import { runStandardsList, runStandardsEnabled } from "../../commands/standards.js";
import {
  runTenantConfigApprove,
  runTenantConfigApplyDev,
  runTenantConfigList,
  runTenantConfigPreview,
  runTenantConfigPropose,
} from "../../commands/tenant-config.js";
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
  runJurisdictionPacksPin,
  runLocaleList,
  runLocaleShow,
} from "../../commands/locale-jurisdiction.js";
import type { OperatorExportEmit } from "../../lib/agent-portability.js";

export function registerPlatformCommands(program: Command): void {
  program
    .command("doctor")
    .description("Check install · workspace · OpenSSL · Wire Console build")
    .option("--json", "JSON output")
    .option("--wire-prod", "Run Wire/Gov/Trust production gate (STRICT)")
    .option("--tenant <id>", "Tenant for operational readiness (mail · operator · scheduling)")
    .option("--repair", "Auto-repair mail-config and orphan draft approvals (with --tenant)")
    .action(async (opts) => {
      const { runDoctor } = await import("../../commands/doctor.js");
      runDoctor({ json: opts.json, wireProd: opts.wireProd, tenant: opts.tenant, repair: opts.repair });
    });

  const integrationsCmd = program
    .command("integrations")
    .description("Tenant integrations status (mail · webhooks · setup)");
  integrationsCmd
    .command("status")
    .description("Show integrations readiness")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runIntegrationsStatus } = await import("../../commands/integrations.js");
      runIntegrationsStatus({ json: opts.json });
    });

  const moduleMessageCmd = program
    .command("module-message")
    .description("Typed inter-module messages (ADR 0040)");
  moduleMessageCmd
    .command("send")
    .description("Append a module message")
    .requiredOption("--from <id>", "Sender agent/module id")
    .requiredOption("--to <id>", "Target agent/module id")
    .requiredOption("--intent <intent>", "inquire | inform | handoff | reply | …")
    .requiredOption("--summary <text>", "L0/L1 payload summary")
    .option("--from-kind <kind>", "agent | module | integration", "agent")
    .option("--to-kind <kind>", "agent | module | integration", "agent")
    .option("--work-order-id <id>", "Related work order")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runModuleMessageSend } = await import("../../commands/module-message.js");
      runModuleMessageSend({
        from: opts.from,
        fromKind: opts.fromKind,
        to: opts.to,
        toKind: opts.toKind,
        intent: opts.intent,
        summary: opts.summary,
        workOrderId: opts.workOrderId,
        json: opts.json,
      });
    });
  moduleMessageCmd
    .command("list")
    .description("List pending messages for a target")
    .requiredOption("--to <id>", "Target agent/module id")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runModuleMessageList } = await import("../../commands/module-message.js");
      runModuleMessageList({ to: opts.to, json: opts.json });
    });
  moduleMessageCmd
    .command("import")
    .description("Import a message YAML file")
    .requiredOption("--file <path>", "Message YAML path")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runModuleMessageImport } = await import("../../commands/module-message.js");
      runModuleMessageImport({ file: opts.file, json: opts.json });
    });

  const workspaceCmd = program.command("workspace").description("OrgOS company workspace (tenants/)");
  workspaceCmd
    .command("init")
    .description("Initialize orgos.yaml + tenants/ in current or target directory")
    .option("--dir <path>", "Workspace directory")
    .option("--name <name>", "Workspace label in orgos.yaml")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runWorkspaceInit } = await import("../../commands/workspace.js");
      runWorkspaceInit({ dir: opts.dir, name: opts.name, json: opts.json });
    });
  workspaceCmd
    .command("show")
    .description("Show resolved workspace paths")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runWorkspaceShow } = await import("../../commands/workspace.js");
      runWorkspaceShow({ json: opts.json });
    });

  program
    .command("init <tenant-id>")
    .description("Workspace init (if needed) + tenant init from _template")
    .option("--name <name>", "Company display / legal name")
    .option("--from <modules...>", "Enable modules (e.g. rental)")
    .option("--jurisdiction <code>", "JP | US | …")
    .option("--wire-console", "Enable wire_console in tenant.yaml")
    .option("--workspace-dir <path>", "Workspace directory")
    .option("--no-validate", "Skip validate after tenant init")
    .action(async (tenantId: string, opts) => {
      const { runWorkspaceInit } = await import("../../commands/workspace.js");
      const { runTenantInitCommand } = await import("../../commands/tenant.js");
      const { existsSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const { workspaceConfigPath, refreshOrgOsPaths } = await import("../../lib/orgos-paths.js");
      const workspaceDir = resolve(
        opts.workspaceDir ?? process.env.ORGOS_WORKSPACE?.trim() ?? process.cwd()
      );
      if (!existsSync(workspaceConfigPath())) {
        runWorkspaceInit({ dir: workspaceDir, name: opts.name ?? tenantId });
      } else {
        process.env.ORGOS_WORKSPACE = workspaceDir;
        refreshOrgOsPaths();
      }
      runTenantInitCommand(tenantId, {
        name: opts.name,
        from: opts.from,
        jurisdiction: opts.jurisdiction,
        wireConsole: opts.wireConsole,
        validate: opts.validate,
      });
    });

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
  modulesCmd
    .command("activate <id>")
    .description("Enable module · copy activation seeds · init agent workspace folders")
    .option("--tenant <id>", "Tenant id")
    .option("--skip-regs", "Do not enable optional regulations")
    .option("--skip-iso", "Do not enable related ISO standards")
    .option("--skip-controls", "Do not merge controls.yaml")
    .option("--json", "JSON output")
    .action((id: string, opts) =>
      runModulesActivate(id, {
        tenant: opts.tenant,
        skipRegs: opts.skipRegs,
        skipIso: opts.skipIso,
        skipControls: opts.skipControls,
        json: opts.json,
      })
    );
  modulesCmd
    .command("scaffold-docs")
    .description("Scaffold Zone B docs folders for enabled modules (modules.yaml)")
    .option("--tenant <id>", "Tenant id")
    .option("--module <id>", "Single module id")
    .option("--json", "JSON output")
    .action((opts: { tenant?: string; module?: string; json?: boolean }) =>
      runModulesScaffoldDocs({
        tenant: opts.tenant,
        moduleId: opts.module,
        json: opts.json,
      })
    );
  modulesCmd
    .command("readiness")
    .description("Module readiness score (definition · contract · CLI · skill · test · tier · operational)")
    .option("--tenant <id>", "Score enabled modules for tenant")
    .option("--module <id>", "Single module id")
    .option("--catalog", "Score full steward/modules catalog (ignore tenant enabled filter)")
    .option("--json", "JSON output")
    .option("--min <n>", "Exit 1 if any module below n%", (v) => Number(v))
    .action((opts: { tenant?: string; module?: string; catalog?: boolean; json?: boolean; min?: number }) =>
      runModulesReadiness({
        tenant: opts.tenant,
        module: opts.module,
        catalog: opts.catalog,
        json: opts.json,
        min: opts.min,
      })
    );

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
    .option("--wire-console", "Enable wire_console in tenant.yaml and start Wire Console")
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
        wireConsole: opts.wireConsole,
      })
    );

  tenantCmd
    .command("setup")
    .description("Interactive tenant integrations setup (mail · webhooks · executive YAML)")
    .option("--answers <jsonPath>", "Non-interactive answers JSON file")
    .option("--non-interactive", "Skip prompts (requires --answers)")
    .option("--operator <id>", "Operator id for setup.completed_by")
    .option("--skip-validate", "Skip validate after setup")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runTenantSetupCommand } = await import("../../commands/tenant-setup.js");
      await runTenantSetupCommand({
        answers: opts.answers,
        nonInteractive: opts.nonInteractive,
        operator: opts.operator,
        skipValidate: opts.skipValidate,
        json: opts.json,
      });
    });

  tenantCmd
    .command("scaffold-data")
    .description("Fill missing skeleton data/ YAML without overwriting existing files")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts: { tenant?: string; json?: boolean }) => runTenantScaffoldData(opts));

  tenantCmd
    .command("align-classification")
    .description("Merge _template classification-registry resources/agents into tenant(s)")
    .option("--tenant <id>", "Single tenant (default: ORGOS_TENANT)")
    .option("--all", "All tenants with tenant.yaml")
    .option("--dry-run", "Preview without writing")
    .option("--json", "JSON output")
    .action((opts: { tenant?: string; all?: boolean; dryRun?: boolean; json?: boolean }) =>
      runTenantAlignClassification(opts)
    );

  tenantCmd
    .command("scaffold-docs")
    .description("Scaffold document folders — Zone A (core) + Zone B (enabled modules)")
    .option("--core-only", "Zone A only (all tenants)")
    .option("--modules-only", "Zone B only (enabled modules)")
    .option("--module <id>", "Single module for Zone B")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts: {
      coreOnly?: boolean;
      modulesOnly?: boolean;
      module?: string;
      tenant?: string;
      json?: boolean;
    }) =>
      runTenantScaffoldDocs({
        tenant: opts.tenant,
        coreOnly: opts.coreOnly,
        modulesOnly: opts.modulesOnly,
        moduleId: opts.module,
        json: opts.json,
      })
    );

  const tenantLifecycleCmd = tenantCmd
    .command("lifecycle")
    .description("Tenant winding-down / archive lifecycle");
  tenantLifecycleCmd
    .command("status")
    .description("Show tenant lifecycle status")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runTenantLifecycleStatus } = await import("../../commands/tenant-lifecycle.js");
      runTenantLifecycleStatus({ json: opts.json });
    });
  tenantLifecycleCmd
    .command("declare-winding-down")
    .description("Declare tenant winding_down (ceo/approver only — human CLI)")
    .requiredOption("--operator-id <id>", "Declaring operator ID")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runTenantLifecycleDeclareWindingDown } = await import("../../commands/tenant-lifecycle.js");
      runTenantLifecycleDeclareWindingDown({
        operatorId: opts.operatorId,
        json: opts.json,
      });
    });
  tenantLifecycleCmd
    .command("archive")
    .description("Mark tenant archived after export")
    .requiredOption("--export-id <id>", "Archive export identifier")
    .option("--retention-until <date>", "Retention end date (ISO)")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runTenantLifecycleArchive } = await import("../../commands/tenant-lifecycle.js");
      runTenantLifecycleArchive({
        exportId: opts.exportId,
        retentionUntil: opts.retentionUntil,
        json: opts.json,
      });
    });

  const wireCmd = program.command("wire").description("Inter-org Wire operator tools");

  wireCmd
    .command("setup")
    .description("Proposal 3 — PKI · client yaml · relay deploy env")
    .option("--force", "Regenerate dev PKI")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runWireSetup } = await import("../../commands/wire-setup.js");
      await runWireSetup({ force: opts.force, json: opts.json });
    });

  const wireConsoleCmd = wireCmd
    .command("console")
    .description("Wire Console — localhost SPA + BFF for outbox/inbox");

  wireConsoleCmd
    .command("build")
    .description("Build Wire Console SPA (required before start)")
    .action(async () => {
      const { runWireConsoleBuild } = await import("../../commands/wire-setup.js");
      await runWireConsoleBuild();
    });

  wireConsoleCmd
    .command("start")
    .description("Start Wire Console daemon")
    .option("--port <n>", "Port", (v: string) => parseInt(v, 10))
    .option("--host <host>", "Bind host", "127.0.0.1")
    .option("--foreground", "Run in foreground (no daemon)")
    .action(async (opts) => {
      const { runWireConsoleStart } = await import("../../commands/wire-console.js");
      await runWireConsoleStart({
        port: opts.port,
        host: opts.host,
        foreground: opts.foreground,
      });
    });

  wireConsoleCmd
    .command("stop")
    .description("Stop Wire Console daemon")
    .action(async () => {
      const { runWireConsoleStop } = await import("../../commands/wire-console.js");
      runWireConsoleStop();
    });

  wireConsoleCmd
    .command("status")
    .description("Wire Console daemon status")
    .action(async () => {
      const { runWireConsoleStatus } = await import("../../commands/wire-console.js");
      runWireConsoleStatus();
    });

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
    .option(
      "--category <id>",
      "Filter by category (e.g. professional_corporation — JP only)"
    )
    .action((code: string, opts: { subdivision?: string; category?: string }) =>
      runJurisdictionEntityForms(code, opts.subdivision, { category: opts.category })
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
  packsCmd
    .command("pin <code>")
    .description("Pin pack source in packs.lock.yaml (bundled or github:org/repo@version)")
    .requiredOption("--source <source>", "bundled · github:org/repo@1.0.0")
    .option("--pack-root <path>", "Override pack_root in lock entry")
    .option("--dry-run", "Print pin without writing lock file")
    .action((code: string, opts: { source: string; packRoot?: string; dryRun?: boolean }) =>
      runJurisdictionPacksPin(code, opts.source, { packRoot: opts.packRoot, dryRun: opts.dryRun })
    );

  const regulationsCmd = program.command("regulations").description("Regulation catalog and tenant effective docs");
  regulationsCmd.command("list").description("List catalog vs tenant regulations").action(runRegulationsList);
  regulationsCmd.command("effective").description("List effective regulation IDs").action(runRegulationsEffective);
  regulationsCmd
    .command("init")
    .description("Register all JP catalog regulations in regulations.yaml (default: disabled) and seed docs")
    .option("--enable", "Set enabled: true (default: all disabled)")
    .option("--no-seed", "Skip seeding docs/company/regulations/")
    .option("--force", "Overwrite existing regulation MD files when seeding")
    .action((opts) =>
      runRegulationsInit({
        enabled: opts.enable ?? false,
        seed: opts.seed !== false,
        force: opts.force,
      })
    );
  regulationsCmd
    .command("seed")
    .description("Copy regulation templates to docs/company/regulations/")
    .option("--force", "Overwrite existing tenant docs")
    .option("--dry-run", "Print what would be seeded")
    .option("--include-disabled", "Seed all tenant-listed regulations (including enabled: false)")
    .option("--id <regId>", "Seed single regulation (repeatable)", (v: string, prev: string[]) => [...prev, v], [])
    .action((opts) =>
      runRegulationsSeed({
        force: opts.force,
        dryRun: opts.dryRun,
        includeDisabled: opts.includeDisabled,
        ids: opts.id?.length ? opts.id : undefined,
      })
    );

  const standardsCmd = program.command("standards").description("ISO standards catalog");
  standardsCmd.command("list").description("List ISO catalog vs tenant standards.yaml").action(runStandardsList);
  standardsCmd.command("enabled").description("List enabled ISO standard IDs").action(runStandardsEnabled);

  const tenantConfigCmd = program
    .command("tenant-config")
    .description("Approval-gated modules/standards/agents toggles");
  tenantConfigCmd
    .command("propose")
    .description("Propose enabling/disabling a standard, module, or agent (creates org approval)")
    .requiredOption("--target <standards|modules|agents>", "Config target")
    .requiredOption("--id <id>", "ISO-27001, module id, or agent id")
    .requiredOption("--enabled <bool>", "true or false", (v: string) => {
      if (v === "true" || v === "1") return true;
      if (v === "false" || v === "0") return false;
      throw new Error("--enabled must be true or false");
    })
    .option("--action <set_enabled|import_enable>", "For modules: import catalog entry and enable")
    .option("--message <text>", "Human-readable summary")
    .action((opts: {
      target: string;
      id: string;
      enabled: boolean;
      message?: string;
      action?: string;
    }) => {
      runTenantConfigPropose(opts);
    });
  tenantConfigCmd
    .command("list")
    .description("List pending (or all) config change requests")
    .option("--all", "Include applied/rejected")
    .action((opts: { all?: boolean }) => runTenantConfigList(opts));
  tenantConfigCmd
    .command("preview")
    .description("Show diff + side effects for an approval id")
    .requiredOption("--id <approvalId>", "APR-… approval id")
    .action((opts: { id: string }) => runTenantConfigPreview(opts));
  tenantConfigCmd
    .command("approve")
    .description("CEO/approver: approve after --reviewed and apply YAML")
    .requiredOption("--id <approvalId>", "APR-… approval id")
    .option("--reviewed", "Confirm preview was reviewed")
    .action((opts: { id: string; reviewed?: boolean }) => runTenantConfigApprove(opts));
  tenantConfigCmd
    .command("apply-dev")
    .description("Dev only: apply CFG-… without approval (blocked in production)")
    .requiredOption("--change-id <changeId>", "CFG-… change id")
    .action((opts: { changeId: string }) =>
      runTenantConfigApplyDev({ changeId: opts.changeId })
    );

  const opsCmd = program.command("ops").description("Operational daily checks (P0 · contracts · maturity)");
  opsCmd.command("daily").description("Daily ops summary (maturity + P0 + contract alerts)").action(runOpsDaily);
  opsCmd.command("p0").description("P0 closing blockers only (exit 1 if open)").action(runOpsP0);

  registerModuleCli(program);

  const platformExtCmd = program
    .command("platform")
    .description("Platform extensibility guides (Agent · Skill · CLI · Wire)");
  platformExtCmd
    .command("guide")
    .description("Print implementation checklist (legacy — prefer extension-check)")
    .option(
      "--topic <name>",
      "philosophy | agent | skill | cli | module | wire | eval | all",
      "all"
    )
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runPlatformGuide } = await import("../../commands/platform-guide.js");
      runPlatformGuide({ topic: opts.topic, json: opts.json });
    });
  platformExtCmd
    .command("extension-check")
    .description("Verify platform extension prerequisites (read-only)")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runPlatformExtensionCheck } = await import("../../commands/platform-extension-check.js");
      runPlatformExtensionCheck({ json: opts.json });
    });
  platformExtCmd
    .command("registry-verify")
    .description("Verify catalog · routing · skills · capability drift")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runPlatformRegistryVerify } = await import("../../commands/platform-registry-verify.js");
      runPlatformRegistryVerify({ json: opts.json });
    });
  platformExtCmd
    .command("scaffold <kind> <id>")
    .description("Dry-run scaffold for agent | skill | module (use --write to create)")
    .option("--write", "Create files on disk")
    .action(async (kind: string, id: string, opts: { write?: boolean }) => {
      const { runPlatformScaffold } = await import("../../commands/platform-scaffold.js");
      runPlatformScaffold({ kind: kind as "agent" | "skill" | "module", id, write: opts.write });
    });

  const skillsCmd = program.command("skills").description("Run Agent Skills from CLI (no Cursor)");
  skillsCmd.command("list").description("List skill CLI commands").action(runSkillsList);
  skillsCmd
    .command("run <id>")
    .description("Run skill: contract-expiry | permit-expiry | monthly-close | variance | records-check | p0 | daily")
    .option("-d, --days <number>", "Horizon days (skill-specific default when omitted)")
    .option("--stale-days <number>", "Stale SLA days (sales-inbound / sales-pipeline skills)")
    .option("-m, --month <YYYY-MM>", "Target month (monthly-close)")
    .option("--markdown", "Markdown output where supported")
    .option("-o, --output <filename>", "Save report under docs/reports/")
    .option("--id <draftId>", "Draft ID (correspondence-send · slack-notify)")
    .option("--dry-run", "Dry run (correspondence send skills)")
    .option("--to <email>", "Recipient (correspondence-draft skill)")
    .option("--subject <text>", "Subject (correspondence-draft skill)")
    .option("--body <text>", "Body (correspondence-draft skill)")
    .option("--channel <email|slack>", "Channel (correspondence-draft skill)")
    .option("--slack-channel <name>", "Slack channel (correspondence-draft skill)")
    .option("--answers <jsonPath>", "Answers JSON (tenant-integrations-setup skill)")
    .option("--topic <name>", "Guide topic (platform-implement-guide skill)")
    .option("--json", "JSON output (platform-implement-guide skill)")
    .option("--write", "Write files where supported (hospitality-sync-derived)")
    .action((id, opts) =>
      runSkill(id, {
        days: opts.days ? parseInt(opts.days, 10) : undefined,
        staleDays: opts.staleDays ? parseInt(opts.staleDays, 10) : undefined,
        month: opts.month,
        markdown: opts.markdown,
        output: opts.output,
        id: opts.id,
        dryRun: opts.dryRun,
        to: opts.to,
        subject: opts.subject,
        body: opts.body,
        channel: opts.channel,
        slackChannel: opts.slackChannel,
        answers: opts.answers,
        topic: opts.topic,
        json: opts.json,
        write: opts.write,
      })
    );

  const chatCmd = program.command("chat").description("Steward Chat BFF + Operator ask");
  chatCmd
    .command("start")
    .description("Start Steward Chat BFF (dev)")
    .option("--host <host>", "Bind host")
    .option("--port <port>", "Bind port", (v: string) => parseInt(v, 10))
    .option("--tenant <id>", "Tenant id")
    .action(async (opts) => {
      const { runChatStart } = await import("../../commands/chat.js");
      await runChatStart(opts);
    });
  chatCmd
    .command("today")
    .description("Print Today context (L1)")
    .option("--json", "JSON output")
    .option("--refresh", "Run pipeline daily before building context")
    .action(async (opts) => {
      const { runChatToday } = await import("../../commands/chat.js");
      await runChatToday(opts);
    });
  chatCmd
    .command("ask <message>")
    .description("Operator ask (CLI thread)")
    .option("--refresh", "Run pipeline daily before ask")
    .action(async (message: string, opts) => {
      const { runChatAsk } = await import("../../commands/chat.js");
      await runChatAsk(message, opts);
    });
  const chatMemoryCmd = chatCmd.command("memory").description("Chat answer-memory index");
  chatMemoryCmd
    .command("reindex")
    .description("Rebuild derived answer-memory from chat threads")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runChatMemoryReindex } = await import("../../commands/chat.js");
      await runChatMemoryReindex(opts);
    });
  const chatFaqCmd = chatCmd.command("faq").description("FAQ index from Good-rated Q&A");
  chatFaqCmd
    .command("build")
    .description("Rebuild FAQ index now")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runChatFaqBuild } = await import("../../commands/chat.js");
      await runChatFaqBuild(opts);
    });

  const operatorCmd = program.command("operator").description("CEO operator layer");
  const operatorRegistryCmd = operatorCmd.command("registry").description("Operator ID registry (data/org/operators.yaml)");
  operatorRegistryCmd
    .command("init")
    .description("Initialize operator registry from company.yaml approvers")
    .option("--no-write-keys", "Do not write ~/.orgos/operators/*.key")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runOperatorInitRegistry } = await import("../../commands/operator-registry.js");
      runOperatorInitRegistry({ writeKeys: opts.writeKeys !== false, json: opts.json });
    });
  operatorRegistryCmd
    .command("list")
    .description("List operators in registry")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runOperatorRegistryList } = await import("../../commands/operator-registry.js");
      runOperatorRegistryList({ json: opts.json });
    });
  operatorRegistryCmd
    .command("rotate-key")
    .description("Rotate operator API key")
    .option("--id <id>", "Operator ID (or global --operator-id / ORGOS_CLI_OPERATOR_ID)")
    .option("--no-write-key", "Do not write key file")
    .action(async (opts, command) => {
      const globals = command.optsWithGlobals() as { operatorId?: string };
      const operatorId = opts.id ?? globals.operatorId ?? process.env.ORGOS_CLI_OPERATOR_ID?.trim();
      if (!operatorId) {
        throw new Error(
          "Operator ID required — pass --id <OP-*> or global --operator-id (root --operator-id conflicts with subcommand flags in some shells)"
        );
      }
      const { runOperatorRotateKey } = await import("../../commands/operator-registry.js");
      runOperatorRotateKey({ operatorId, writeKey: opts.writeKey !== false });
    });
  operatorCmd
    .command("init-registry")
    .description("Alias for operator registry init")
    .option("--no-write-keys", "Do not write ~/.orgos/operators/*.key")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runOperatorInitRegistry } = await import("../../commands/operator-registry.js");
      runOperatorInitRegistry({ writeKeys: opts.writeKeys !== false, json: opts.json });
    });
  const passkeyBootstrapCmd = operatorCmd
    .command("passkey-bootstrap")
    .description("Passkey bootstrap token (production first registration — ADR 0041)");
  passkeyBootstrapCmd
    .command("mint")
    .description("Mint a one-time bootstrap token for an operator")
    .requiredOption("--operator-id <id>", "Operator ID")
    .option("--ttl <duration>", "Token TTL (e.g. 24h)", "24h")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runPasskeyBootstrapMint } = await import("../../commands/passkey-bootstrap.js");
      runPasskeyBootstrapMint({
        operatorId: opts.operatorId,
        ttl: opts.ttl,
        json: opts.json,
      });
    });
  passkeyBootstrapCmd
    .command("status")
    .description("Show whether bootstrap token is required")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runPasskeyBootstrapStatus } = await import("../../commands/passkey-bootstrap.js");
      runPasskeyBootstrapStatus({ json: opts.json });
    });
  passkeyBootstrapCmd
    .command("field-check")
    .description("Automated passkey / WebAuthn field readiness (HTTP + local state)")
    .requiredOption("--url <url>", "Operator Console base URL")
    .option("--scope <scope>", "chat | wire | all", "all")
    .option("--json", "JSON output")
    .option("--record", "Write automated checklist rows to passkey-field-validation-log.md")
    .option("--operator <name>", "Operator name for log 担当 column")
    .action(async (opts) => {
      const { runPasskeyFieldCheckCli } = await import("../../commands/passkey-field-check.js");
      await runPasskeyFieldCheckCli({
        url: opts.url,
        scope: opts.scope,
        json: opts.json,
        record: opts.record,
        operator: opts.operator,
      });
    });
  const loginDomainCmd = operatorCmd
    .command("login-domain")
    .description("Company login domain policy (founder migration)");
  loginDomainCmd
    .command("set")
    .description("Add company email domain and open founder migration grace if needed")
    .requiredOption("--domain <domain>", "Company domain (e.g. malkk.com)")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runOperatorLoginDomainSet } = await import("../../commands/operator-login-policy.js");
      runOperatorLoginDomainSet({ domain: opts.domain, json: opts.json });
    });

  const founderEmailCmd = operatorCmd.command("founder-email").description("Founder personal email migration");
  founderEmailCmd
    .command("retire")
    .description("Retire grandfather personal email after ceo uses company domain")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runOperatorFounderEmailRetire } = await import("../../commands/operator-login-policy.js");
      runOperatorFounderEmailRetire({ json: opts.json });
    });
  founderEmailCmd
    .command("status")
    .description("Show founder migration status")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runOperatorFounderEmailStatus } = await import("../../commands/operator-login-policy.js");
      runOperatorFounderEmailStatus({ json: opts.json });
    });

  const liquidatorCmd = operatorCmd.command("liquidator").description("Winding-down liquidator seats");
  liquidatorCmd
    .command("add")
    .description("Add liquidator seat (winding_down only)")
    .requiredOption("--email <email>", "Company-domain liquidator email")
    .requiredOption("--until <date>", "guest_expires_at (ISO date)")
    .requiredOption("--display-name <name>", "Display name")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runOperatorLiquidatorAdd } = await import("../../commands/operator-liquidator.js");
      runOperatorLiquidatorAdd({
        email: opts.email,
        until: opts.until,
        displayName: opts.displayName,
        json: opts.json,
      });
    });
  liquidatorCmd
    .command("extend")
    .description("Extend liquidator seat (max 24 months from winding_down)")
    .requiredOption("--operator-id <id>", "Liquidator operator ID")
    .requiredOption("--until <date>", "New guest_expires_at")
    .requiredOption("--reason <text>", "Audit reason (L1)")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runOperatorLiquidatorExtend } = await import("../../commands/operator-liquidator.js");
      runOperatorLiquidatorExtend({
        operatorId: opts.operatorId,
        until: opts.until,
        reason: opts.reason,
        json: opts.json,
      });
    });

  operatorCmd
    .command("sync-policy")
    .description("Sync steward/rules to Cursor mirrors, AGENTS.md, and engineering 00–09")
    .option(
      "--emit <target>",
      "cursor | agents-md | dev-guide | engineering | data-classification | all",
      "all"
    )
    .action(async (opts) => {
      const { runOperatorSyncPolicy } = await import("../../commands/operator.js");
      runOperatorSyncPolicy({
        emit: opts.emit as
          | "cursor"
          | "agents-md"
          | "dev-guide"
          | "engineering"
          | "data-classification"
          | "all",
      });
    });
  operatorCmd
    .command("export")
    .description("Export tool-neutral agent packs + MCP snippets")
    .option("--agent <id>", "Single agent id (e.g. finance)")
    .option("--all", "All agents in registry.yaml")
    .option("--emit <target>", "packs | index | mcp | all", "all")
    .option("--full-policy", "Include full operator policy in each pack")
    .action(async (opts) => {
      const { runOperatorExport } = await import("../../commands/operator.js");
      runOperatorExport({
        agent: opts.agent,
        all: opts.all,
        emit: opts.emit as OperatorExportEmit,
        fullPolicy: opts.fullPolicy,
      });
    });
  operatorCmd
    .command("portability")
    .description("Agent portability score (target: all dimensions ≥90%)")
    .option("--json", "JSON output")
    .option("--write", "Write steward/platform/agent/PORTABILITY-ASSESSMENT.md")
    .action(async (opts) => {
      const { runOperatorPortability } = await import("../../commands/operator.js");
      runOperatorPortability({ json: opts.json, write: opts.write });
    });

  const operatorRuntimeCmd = operatorCmd.command("runtime").description("Operator runtime adapters");
  operatorRuntimeCmd.command("show").description("Show runtime.yaml config").action(async () => {
    const { runOperatorRuntimeShow } = await import("../../commands/operator.js");
    runOperatorRuntimeShow();
  });
  operatorRuntimeCmd.command("test").description("Test shell adapter").action(async () => {
    const { runOperatorRuntimeTest } = await import("../../commands/operator.js");
    await runOperatorRuntimeTest();
  });
  operatorRuntimeCmd
    .command("stats")
    .description("LLM telemetry summary")
    .option("--limit <n>", "Sample window", (v: string) => parseInt(v, 10))
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runOperatorRuntimeStats } = await import("../../commands/operator.js");
      runOperatorRuntimeStats({ limit: opts.limit, json: opts.json });
    });

  const operatorConsoleCmd = operatorCmd.command("console").description("Combined Operator Console");
  operatorConsoleCmd
    .command("start")
    .description("Start Chat + Wire on one origin (:9470)")
    .option("--host <host>", "Bind host", "127.0.0.1")
    .option("--port <port>", "Bind port", (v: string) => parseInt(v, 10))
    .option("--tenant <id>", "Tenant id")
    .action(async (opts) => {
      const { runOperatorConsoleStart } = await import("../../commands/operator-console.js");
      await runOperatorConsoleStart(opts);
    });

  const mcpCmd = program.command("mcp").description("Steward MCP tools (stdio / HTTP)");
  mcpCmd.command("start").description("MCP stdio server").action(async () => {
    const { runMcpStart } = await import("../../commands/mcp.js");
    await runMcpStart();
  });
  mcpCmd
    .command("serve-http")
    .description("MCP HTTP/SSE server (Bearer ORGOS_MCP_TOKEN)")
    .option("--host <host>", "Bind host", process.env.ORGOS_MCP_HTTP_HOST ?? "127.0.0.1")
    .option("--port <port>", "Bind port", process.env.ORGOS_MCP_HTTP_PORT ?? "9478")
    .action(async (opts) => {
      const { runMcpServeHttp } = await import("../../commands/mcp.js");
      await runMcpServeHttp({
        host: opts.host,
        port: opts.port ? parseInt(String(opts.port), 10) : undefined,
      });
    });
  mcpCmd.command("rotate-token").description("Generate new ORGOS_MCP_TOKEN").action(async () => {
    const { runMcpRotateToken } = await import("../../commands/mcp.js");
    runMcpRotateToken();
  });

  const llmCmd = program.command("llm").description("LLM worker pool");
  const llmWorkersCmd = llmCmd.command("workers").description("Manage LLM workers.yaml");
  llmWorkersCmd
    .command("init")
    .description("Create data/llm/workers.yaml from env defaults")
    .option("--tenant <id>", "Tenant id")
    .option("--force", "Overwrite existing config")
    .action((opts) => {
      void import("../../commands/llm.js").then(({ runLlmWorkersInit }) =>
        runLlmWorkersInit({ tenant: opts.tenant, force: opts.force }),
      );
    });
  llmWorkersCmd
    .command("list")
    .description("List configured LLM workers")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => {
      void import("../../commands/llm.js").then(({ runLlmWorkersList }) =>
        runLlmWorkersList({ tenant: opts.tenant, json: opts.json }),
      );
    });
  llmWorkersCmd
    .command("probe")
    .description("Probe worker health (OpenAI-compatible /models)")
    .option("--tenant <id>", "Tenant id")
    .option("--id <workerId>", "Specific worker id")
    .action(async (opts) => {
      const { runLlmWorkersProbe } = await import("../../commands/llm.js");
      await runLlmWorkersProbe({ tenant: opts.tenant, id: opts.id });
    });

  const commandsCmd = program.command("commands").description("Chat command router (skill catalog)");
  commandsCmd
    .command("list")
    .description("List chat-enabled commands")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => {
      void import("../../commands/operator-commands.js").then(({ runCommandsList }) =>
        runCommandsList({ tenant: opts.tenant, json: opts.json })
      );
    });
  commandsCmd
    .command("match")
    .description("Resolve a natural-language request to a CLI command (dry-run)")
    .requiredOption("--text <message>", "User message")
    .option("--tenant <id>", "Tenant id")
    .option("--skill <id>", "Force skill id")
    .option("--execute", "Execute read commands immediately (write still needs confirmation path)")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runCommandsMatch } = await import("../../commands/operator-commands.js");
      await runCommandsMatch({
        tenant: opts.tenant,
        text: opts.text,
        skillId: opts.skill,
        execute: opts.execute,
        json: opts.json,
      });
    });

  const guardCmd = program
    .command("guard")
    .description("Agent filesystem write gate (Ed25519 identities · signed grants)");
  guardCmd
    .command("init")
    .description("Create tenant issuer key and public identity registry")
    .option("--seed", "Issue write grants from agent capability catalog")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runGuardInit } = await import("../../commands/fs-guard.js");
      runGuardInit({ seed: opts.seed, json: opts.json });
    });
  guardCmd
    .command("keygen")
    .description("Generate an agent Ed25519 keypair (private key stays on this host)")
    .requiredOption("--agent <id>", "Agent id (e.g. finance)")
    .option("--rotate", "Replace an existing agent key")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runGuardKeygen } = await import("../../commands/fs-guard.js");
      runGuardKeygen({ agent: opts.agent, rotate: opts.rotate, json: opts.json });
    });
  guardCmd
    .command("grant")
    .description("Issue a signed path grant to an agent")
    .requiredOption("--agent <id>", "Agent id")
    .requiredOption("--path <pattern>", "Logical path glob (data/finance/**)")
    .option("--op <op>", "read | write", "write")
    .option("--expires <iso>", "Optional expiry timestamp")
    .option("--reason <text>", "Grant reason")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runGuardGrant } = await import("../../commands/fs-guard.js");
      runGuardGrant({
        agent: opts.agent,
        path: opts.path,
        op: opts.op,
        expires: opts.expires,
        reason: opts.reason,
        json: opts.json,
      });
    });
  guardCmd
    .command("revoke")
    .description("Revoke a grant by id")
    .requiredOption("--id <grantId>", "AGRNT-YYYYMMDD-NNN")
    .option("--reason <text>", "Revoke reason")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runGuardRevoke } = await import("../../commands/fs-guard.js");
      runGuardRevoke({ id: opts.id, reason: opts.reason, json: opts.json });
    });
  guardCmd
    .command("list")
    .description("List agent public keys and grants")
    .option("--agent <id>", "Filter by agent")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runGuardList } = await import("../../commands/fs-guard.js");
      runGuardList({ agent: opts.agent, json: opts.json });
    });
  guardCmd
    .command("check")
    .description("Check whether an agent grant covers a path")
    .requiredOption("--agent <id>", "Agent id")
    .requiredOption("--path <path>", "Logical path")
    .option("--op <op>", "read | write", "write")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runGuardCheck } = await import("../../commands/fs-guard.js");
      runGuardCheck({ agent: opts.agent, path: opts.path, op: opts.op, json: opts.json });
    });
  guardCmd
    .command("hash")
    .description("Print sha256 of a logical tenant file (empty file = sha256 of empty string)")
    .requiredOption("--path <path>", "Logical path")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runGuardHash } = await import("../../commands/fs-guard.js");
      runGuardHash({ path: opts.path, json: opts.json });
    });
  guardCmd
    .command("apply")
    .description("Sign and write a file if the agent grant allows it")
    .requiredOption("--agent <id>", "Agent id whose host key signs the write")
    .requiredOption("--path <path>", "Logical destination path")
    .requiredOption("--from <file>", "Source file to write")
    .option("--run-id <id>", "Optional AIA run id")
    .option("--expected-sha256 <hex>", "Required CAS: sha256 of the current destination file")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runGuardApply } = await import("../../commands/fs-guard.js");
      runGuardApply({
        agent: opts.agent,
        path: opts.path,
        from: opts.from,
        runId: opts.runId,
        expectedSha256: opts.expectedSha256,
        json: opts.json,
      });
    });

  const aiaCmd = program.command("aia").description("AIA parallel runtime (ADR 0040)");
  aiaCmd
    .command("status")
    .description("Show tenant AIA runtime config and scheduler metrics")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { createAiaScheduler, loadAiaRuntimeConfig } = await import(
        "../../lib/aia/scheduler.js"
      );
      const config = loadAiaRuntimeConfig();
      const scheduler = createAiaScheduler(config);
      const payload = { config, metrics: scheduler.metrics() };
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      console.log(`tier=${config.tier} max_concurrent_aia=${config.max_concurrent_aia}`);
      console.log(`running=${payload.metrics.aia_running} queued=${payload.metrics.aia_queued}`);
    });

  const notificationsCmd = program.command("notifications").description("Push notifications (tenant registry)");
  notificationsCmd
    .command("test")
    .description("Send test notification payload")
    .option("--dry-run", "Print payload without POST")
    .option("--event <name>", "Event id", "pipeline_daily_complete")
    .action(async (opts) => {
      const { runNotificationsTest } = await import("../../commands/notifications.js");
      await runNotificationsTest({ dryRun: opts.dryRun, event: opts.event });
    });
}
