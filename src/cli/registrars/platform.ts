import type { Command } from "commander";
import {
  runModulesList,
  runModulesSyncContext,
  runModulesCheck,
  runModulesCheckAll,
  runModulesActivate,
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
  runJurisdictionPacksPin,
  runLocaleList,
  runLocaleShow,
} from "../../commands/locale-jurisdiction.js";

export function registerPlatformCommands(program: Command): void {
  program
    .command("doctor")
    .description("Check install · workspace · OpenSSL · Wire Console build")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runDoctor } = await import("../../commands/doctor.js");
      runDoctor({ json: opts.json });
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
  operatorCmd
    .command("sync-policy")
    .description("Sync operator-policy.md to Cursor rule / AGENTS.md")
    .option("--emit <target>", "cursor | agents-md | dev-guide | all", "all")
    .action(async (opts) => {
      const { runOperatorSyncPolicy } = await import("../../commands/operator.js");
      runOperatorSyncPolicy({ emit: opts.emit as "cursor" | "agents-md" | "dev-guide" | "all" });
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
