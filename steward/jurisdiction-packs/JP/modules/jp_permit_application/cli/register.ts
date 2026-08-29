import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import { listPermitOpeningBlockers } from "../../../../../../src/lib/permit-opening-gate.js";
import {
  listCatalogModuleIds,
} from "../../../../../../src/lib/modules.js";
import {
  loadRequiredComplianceFile,
  summarizeRequirement,
} from "../../../../../../src/lib/required-compliance.js";
import {
  runPermitAppApprove,
  runPermitAppCatalogStatus,
  runPermitAppClarify,
  runPermitAppCreate,
  runPermitAppHandoff,
  runPermitAppProcedures,
  runPermitAppSubmitMark,
  runPermitApplicationChecklist,
  runPermitApplicationDraft,
  runPermitApplicationExportPdf,
  runPermitApplicationPrepare,
  runPermitApplicationShow,
} from "./application-lib.js";
import {
  runPermitAppIntakeAttest,
  runPermitAppIntakePlan,
  runPermitAppIntakeStartApp,
} from "./intake-cli.js";
import { MODULE_ID } from "./lib.js";

export { MODULE_ID };

function registerPermitAppCommands(operationsCmd: Command): void {
  const cmd = operationsCmd
    .command("permit-app")
    .description("JP permit application — obtain/renew/change projects (jp_permit_application)");

  cmd
    .command("create")
    .description(
      "Create APP-* application case (catalog type; business module not required)"
    )
    .requiredOption("--type <permit_type_id>", "Permit type id (e.g. pt-ryokan-shukuhaku)")
    .option("--property <PROP-xxx>", "Property id (物件系のみ · 全社向け許可は省略可)")
    .option("--phase <phase>", "obtain | renew | change", "obtain")
    .option("--notes <text>", "Notes")
    .option("--write", "Save to application-registry.yaml")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitAppCreate({
        type: opts.type,
        property: opts.property,
        phase: opts.phase,
        notes: opts.notes,
        write: opts.write,
        json: opts.json,
      })
    );

  cmd
    .command("catalog-status")
    .description(
      "国法級カタログ単独取得可否 — form カバー · 業モジュール不要の導線"
    )
    .option("--json", "JSON output")
    .action((opts) => runPermitAppCatalogStatus({ json: opts.json }));

  cmd
    .command("prepare")
    .description("Auto-fill draft fields from company/property + field-map")
    .requiredOption("--application <id>", "Application id")
    .option("--structure-use <text>", "建物用途（手入力）")
    .option("--business-type <text>", "業態・取扱区分（古物区分など）")
    .option("--license-type <text>", "酒類免許種別")
    .option("--site-manager <name>", "営業所管理者氏名")
    .option("--write", "Save draft YAML")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitApplicationPrepare({
        application: opts.application,
        structureUse: opts.structureUse,
        businessType: opts.businessType,
        licenseType: opts.licenseType,
        siteManager: opts.siteManager,
        write: opts.write,
        json: opts.json,
      })
    );

  cmd
    .command("show")
    .description("Show application draft YAML fields")
    .requiredOption("--application <id>", "Application id")
    .option("--json", "JSON output")
    .action((opts) => runPermitApplicationShow({ application: opts.application, json: opts.json }));

  cmd
    .command("procedures")
    .description("Show obtain/renew/change procedure steps from permit-conditions.csv")
    .option("--type <permit_type_id>", "Permit type id")
    .option("--application <id>", "Application id (resolves type/phase)")
    .option("--phase <phase>", "obtain | renew | change")
    .option("--write", "Write docs/permit-applications/{id}/procedures.md")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitAppProcedures({
        type: opts.type,
        application: opts.application,
        phase: opts.phase,
        write: opts.write,
        json: opts.json,
      })
    );

  cmd
    .command("requirements")
    .description("Show Required Compliance declarations (ADR 0012) for modules")
    .option("--module <id>", "Module id (default: all with declarations among enabled + known)")
    .option("--json", "JSON output")
    .action((opts: { module?: string; json?: boolean }) => {
      const ids = opts.module
        ? [opts.module]
        : listCatalogModuleIds().filter((id) => loadRequiredComplianceFile(id));
      const rows = ids
        .map((id) => ({ id, file: loadRequiredComplianceFile(id) }))
        .filter((r) => r.file);
      if (opts.json) {
        console.log(JSON.stringify(rows.map((r) => r.file), null, 2));
        return;
      }
      console.log("# Required Compliance\n");
      for (const { id, file } of rows) {
        console.log(`## ${id}`);
        for (const req of file!.requirements) {
          console.log(`- ${summarizeRequirement(req)}`);
          if (req.legal_basis) console.log(`  根拠: ${req.legal_basis}`);
        }
        console.log("");
      }
      if (!rows.length) console.log("（宣言ファイルなし）");
    });

  const intake = cmd
    .command("intake")
    .description(
      "Module activate compliance intake — attest pre-existing permits or start APP"
    );

  intake
    .command("plan")
    .description("Show intake plan for a business module (after activate)")
    .requiredOption("--module <id>", "Business module id")
    .option("--property <PROP-xxx>", "Property scope")
    .option("--write", "Persist session under data/permit-applications/intake/")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitAppIntakePlan({
        module: opts.module,
        property: opts.property,
        write: opts.write,
        json: opts.json,
      })
    );

  intake
    .command("attest")
    .description(
      "Declare pre-existing permit · copy PDF evidence · PER active（--module 省略可 = カタログ単独）"
    )
    .option("--module <id>", "Business module id（省略時はカタログ種別のみ検証）")
    .requiredOption("--type <permit_type_id>", "Permit type (e.g. pt-ryokan-shukuhaku)")
    .requiredOption("--permit-number <no>", "Official permit / license number")
    .requiredOption("--issued-on <YYYY-MM-DD>", "Issue date")
    .requiredOption("--evidence <path>", "Path to certificate PDF (or image)")
    .option("--property <PROP-xxx>", "Property id")
    .option("--issuer <label>", "Issuer label")
    .option("--write", "Write registry · copy evidence · INDEX · event")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitAppIntakeAttest({
        module: opts.module,
        type: opts.type,
        permitNumber: opts.permitNumber,
        issuedOn: opts.issuedOn,
        evidence: opts.evidence,
        property: opts.property,
        issuer: opts.issuer,
        write: opts.write,
        json: opts.json,
      })
    );

  intake
    .command("start-app")
    .description("Not yet obtained — create APP-* obtain case via permit application module")
    .requiredOption("--module <id>", "Business module id")
    .requiredOption("--type <permit_type_id>", "Permit type to obtain")
    .option("--property <PROP-xxx>", "Property id")
    .option("--write", "Save application-registry")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitAppIntakeStartApp({
        module: opts.module,
        type: opts.type,
        property: opts.property,
        write: opts.write,
        json: opts.json,
      })
    );

  cmd
    .command("checklist")
    .description("Required field check + template blank（未記載）detection before PDF export")
    .requiredOption("--application <id>", "Application id")
    .option("--write", "Update draft checklist status")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitApplicationChecklist({
        application: opts.application,
        write: opts.write,
        json: opts.json,
      })
    );

  cmd
    .command("clarify")
    .description(
      "Show CEO/operator questions for blank fields（提出可能水準まで引き上げる）"
    )
    .requiredOption("--application <id>", "Application id")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitAppClarify({ application: opts.application, json: opts.json })
    );

  cmd
    .command("draft")
    .description("Generate review MD from draft + template")
    .requiredOption("--application <id>", "Application id")
    .option("--write", "Write docs/permit-applications/{id}/application.md")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitApplicationDraft({
        application: opts.application,
        write: opts.write,
        json: opts.json,
      })
    );

  cmd
    .command("export-pdf")
    .description("Compile TeX → PDF for submission (requires xelatex)")
    .requiredOption("--application <id>", "Application id")
    .option("--write", "Write PDF to docs/io/outbox/submissions/")
    .option("--force", "Export even if checklist incomplete / legacy MD fallback")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitApplicationExportPdf({
        application: opts.application,
        write: opts.write,
        force: opts.force,
        json: opts.json,
      })
    );

  cmd
    .command("handoff")
    .description("Record gyoseishoshi / external specialist handoff")
    .requiredOption("--application <id>", "Application id")
    .option("--contact <id>", "Contact / stakeholder id")
    .option("--authority <label>", "Authority label (ja)")
    .option("--channel <channel>", "counter | mail | online_manual")
    .option("--notes <text>", "Notes")
    .option("--write", "Save handoff YAML")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitAppHandoff({
        application: opts.application,
        contact: opts.contact,
        authority: opts.authority,
        channel: opts.channel,
        notes: opts.notes,
        write: opts.write,
        json: opts.json,
      })
    );

  cmd
    .command("submit-mark")
    .description("Mark application as submitted (human submitted; no auto-send)")
    .requiredOption("--application <id>", "Application id")
    .option("--write", "Update application-registry")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitAppSubmitMark({
        application: opts.application,
        write: opts.write,
        json: opts.json,
      })
    );

  cmd
    .command("approve")
    .description("Approve → upsert PER active + obligation instances")
    .requiredOption("--application <id>", "Application id")
    .requiredOption("--permit-number <number>", "Official permit number (human-verified)")
    .requiredOption("--issued-on <YYYY-MM-DD>", "Issue date")
    .option("--write", "Write permit-registry + application-registry")
    .option("--json", "JSON output")
    .action((opts) =>
      runPermitAppApprove({
        application: opts.application,
        permitNumber: opts.permitNumber,
        issuedOn: opts.issuedOn,
        write: opts.write,
        json: opts.json,
      })
    );

  cmd
    .command("gate")
    .description("G-01 opening blockers — required PER not active for enabled modules")
    .option("--json", "JSON output")
    .action((opts) => {
      const blockers = listPermitOpeningBlockers();
      if (opts.json) {
        console.log(JSON.stringify({ blockers }, null, 2));
        return;
      }
      console.log("# 許認可開業ゲート（G-01）\n");
      if (!blockers.length) {
        console.log("✓ ブロッカーなし — 必須許可は active");
        return;
      }
      for (const b of blockers) {
        console.log(`- **${b.title}**`);
        console.log(`  ${b.detail}`);
        const found = b.found_statuses ?? [];
        if (found.length) {
          console.log(
            `  台帳: ${found.map((s) => `${s.permit_type_id}=${s.status}`).join(", ")}`
          );
        }
      }
      process.exitCode = 1;
    });
}

export const jp_permit_applicationCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerPermitAppCommands(ctx.operationsCmd);
  },
};
