import type { Command } from "commander";
import {
  runModulesList,
  runModulesSyncContext,
  runModulesCheck,
  runModulesCheckAll,
  runModulesActivate,
  runModulesScaffoldDocs,
} from "../../commands/modules.js";
import { runTenantScaffoldDocs } from "../../commands/tenant-scaffold-docs.js";
import { runMapList, runMapResolve, runMapTree } from "../../commands/map.js";
import { runPipelineDaily, runPipelineList, runPipelineWeekly } from "../../commands/pipeline.js";
import {
  runTenantInitCommand,
  runTenantScaffoldData,
  runTenantAlignClassification,
} from "../../commands/tenant.js";
import {
  runRegulationsList,
  runRegulationsEffective,
  runRegulationsSeed,
  runRegulationsInit,
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
      runDoctor({
        json: opts.json,
        wireProd: opts.wireProd,
        tenant: opts.tenant,
        repair: opts.repair,
      });
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

  const workspaceCmd = program
    .command("workspace")
    .description("OrgOS company workspace (tenants/)");
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

  modulesCmd
    .command("list")
    .description("List steward/modules catalog vs tenant modules.yaml")
    .action(runModulesList);
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

  const mapCmd = program
    .command("map")
    .description("Logical → physical path map (tenant · framework)");
  mapCmd
    .command("list")
    .description("List common logical paths for active tenant")
    .action(runMapList);
  mapCmd
    .command("resolve <path>")
    .description("Resolve one logical path (e.g. data/company.yaml)")
    .action(runMapResolve);
  mapCmd
    .command("tree")
    .description("Tenant map tree (enabled modules · dependency-graph nodes)")
    .action(runMapTree);

  const pipelineCmd = program
    .command("pipeline")
    .description("Automation pipelines (Cursor-external)");
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
    .action(
      (opts: {
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

  const localeCmd = program
    .command("locale")
    .description("Display language (independent from legal jurisdiction)");
  localeCmd.command("list").description("List supported display languages").action(runLocaleList);
  localeCmd
    .command("show")
    .description("Show resolved display locale for active tenant")
    .action(runLocaleShow);

  const jurisdictionCmd = program.command("jurisdiction").description("Legal jurisdiction packs");
  jurisdictionCmd
    .command("countries")
    .description("List jurisdiction countries (ISO 3166-1 alpha-2)")
    .option("--all", "Include stub-tier countries")
    .action((opts: { all?: boolean }) => runJurisdictionCountries(opts.all));
  jurisdictionCmd
    .command("list")
    .description("List full-tier jurisdiction packs")
    .action(runJurisdictionList);
  jurisdictionCmd
    .command("show")
    .description("Show resolved legal jurisdiction for active tenant")
    .action(runJurisdictionShow);
  jurisdictionCmd
    .command("entity-forms <code>")
    .description("List selectable entity forms for a jurisdiction")
    .option("--subdivision <code>", "Legal subdivision (e.g. DE for Delaware)")
    .option("--category <id>", "Filter by category (e.g. professional_corporation — JP only)")
    .action((code: string, opts: { subdivision?: string; category?: string }) =>
      runJurisdictionEntityForms(code, opts.subdivision, { category: opts.category })
    );
  jurisdictionCmd
    .command("check [code]")
    .description("Verify jurisdiction pack catalog exists")
    .action((code: string | undefined) => runJurisdictionCheck(code));

  const packsCmd = jurisdictionCmd
    .command("packs")
    .description("Installed jurisdiction pack pins (OSS)");
  packsCmd
    .command("list")
    .description("List packs.lock.yaml pins")
    .action(runJurisdictionPacksList);
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

  const regulationsCmd = program
    .command("regulations")
    .description("Regulation catalog and tenant effective docs");
  regulationsCmd
    .command("list")
    .description("List catalog vs tenant regulations")
    .action(runRegulationsList);
  regulationsCmd
    .command("effective")
    .description("List effective regulation IDs")
    .action(runRegulationsEffective);
  regulationsCmd
    .command("init")
    .description(
      "Register all JP catalog regulations in regulations.yaml (default: disabled) and seed docs"
    )
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
    .option(
      "--id <regId>",
      "Seed single regulation (repeatable)",
      (v: string, prev: string[]) => [...prev, v],
      []
    )
    .action((opts) =>
      runRegulationsSeed({
        force: opts.force,
        dryRun: opts.dryRun,
        includeDisabled: opts.includeDisabled,
        ids: opts.id?.length ? opts.id : undefined,
      })
    );

  const standardsCmd = program.command("standards").description("ISO standards catalog");
  standardsCmd
    .command("list")
    .description("List ISO catalog vs tenant standards.yaml")
    .action(runStandardsList);
  standardsCmd
    .command("enabled")
    .description("List enabled ISO standard IDs")
    .action(runStandardsEnabled);

  const opsCmd = program
    .command("ops")
    .description("Operational daily checks (P0 · contracts · maturity)");
  opsCmd
    .command("daily")
    .description("Daily ops summary (maturity + P0 + contract alerts)")
    .action(runOpsDaily);
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
      const { runPlatformExtensionCheck } =
        await import("../../commands/platform-extension-check.js");
      runPlatformExtensionCheck({ json: opts.json });
    });
  platformExtCmd
    .command("registry-verify")
    .description("Verify catalog · routing · skills · capability drift")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runPlatformRegistryVerify } =
        await import("../../commands/platform-registry-verify.js");
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
    .description(
      "Run skill: contract-expiry | permit-expiry | monthly-close | variance | records-check | p0 | daily"
    )
    .option("-d, --days <number>", "Days ahead (contract-expiry)", "90")
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
    .action((id, opts) =>
      runSkill(id, {
        days: opts.days ? parseInt(opts.days, 10) : undefined,
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

  const operatorCmd = program.command("operator").description("CEO operator layer");
  const operatorRegistryCmd = operatorCmd
    .command("registry")
    .description("Operator ID registry (data/org/operators.yaml)");
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
          "cursor" | "agents-md" | "dev-guide" | "engineering" | "data-classification" | "all",
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

  const operatorRuntimeCmd = operatorCmd
    .command("runtime")
    .description("Operator runtime adapters");
  operatorRuntimeCmd
    .command("show")
    .description("Show runtime.yaml config")
    .action(async () => {
      const { runOperatorRuntimeShow } = await import("../../commands/operator.js");
      runOperatorRuntimeShow();
    });
  operatorRuntimeCmd
    .command("test")
    .description("Test shell adapter")
    .action(async () => {
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

  const operatorConsoleCmd = operatorCmd
    .command("console")
    .description("Combined Operator Console");
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
  mcpCmd
    .command("start")
    .description("MCP stdio server")
    .action(async () => {
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
  mcpCmd
    .command("rotate-token")
    .description("Generate new ORGOS_MCP_TOKEN")
    .action(async () => {
      const { runMcpRotateToken } = await import("../../commands/mcp.js");
      runMcpRotateToken();
    });

  const notificationsCmd = program
    .command("notifications")
    .description("Push notifications (tenant registry)");
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
