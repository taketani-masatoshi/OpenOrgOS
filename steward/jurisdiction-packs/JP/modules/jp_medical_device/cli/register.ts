import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  runJpMedicalDeviceAeAdd,
  runJpMedicalDeviceAeMarkFiled,
  runJpMedicalDeviceApplicationCatalog,
  runJpMedicalDeviceApplicationDraft,
  runJpMedicalDeviceAuditList,
  runJpMedicalDeviceCapaClose,
  runJpMedicalDeviceCapaList,
  runJpMedicalDeviceCapaOpen,
  runJpMedicalDeviceCapaRecordEffectiveness,
  runJpMedicalDeviceCapaScheduleEffectiveness,
  runJpMedicalDeviceChangeList,
  runJpMedicalDeviceChangeOpen,
  runJpMedicalDeviceChangeProposeImplement,
  runJpMedicalDeviceComplaintAdd,
  runJpMedicalDeviceComplaintPromoteAe,
  runJpMedicalDeviceDeadlines,
  runJpMedicalDeviceDocProposeApproval,
  runJpMedicalDeviceGvpCatalog,
  runJpMedicalDeviceGvpDraft,
  runJpMedicalDeviceGvpEscalate,
  runJpMedicalDeviceInquiryClose,
  runJpMedicalDeviceInquiryList,
  runJpMedicalDeviceInquiryOpen,
  runJpMedicalDeviceInquirySetResponse,
  runJpMedicalDeviceLedgerAdd,
  runJpMedicalDeviceLedgerClose,
  runJpMedicalDeviceLedgerList,
  runJpMedicalDeviceLedgerStatus,
  runJpMedicalDeviceObligations,
  runJpMedicalDevicePmsList,
  runJpMedicalDevicePmsOpen,
  runJpMedicalDevicePmsReview,
  runJpMedicalDeviceQmsCatalog,
  runJpMedicalDeviceQmsDraft,
  runJpMedicalDeviceShow,
  runJpMedicalDeviceValidate,
} from "./commands.js";

export const MODULE_ID = "jp_medical_device";

function registerMedicalDeviceCommands(operationsCmd: Command): void {
  const cmd = operationsCmd
    .command("medical-device")
    .description("JP medical device — QMS · GVP · 台帳 · CAPA · PMS (jp_medical_device)");

  cmd.command("show").option("--json", "JSON output").action((opts) => runJpMedicalDeviceShow({ json: opts.json }));

  cmd.command("validate").action(() => runJpMedicalDeviceValidate());

  cmd
    .command("deadlines")
    .description("業許可 · 品目認証 · 教育 · CAPA · GVP · 照会 · PMS の期限")
    .option("--all", "OK も含める")
    .option("--json", "JSON output")
    .action((opts) => runJpMedicalDeviceDeadlines({ json: opts.json, all: opts.all }));

  cmd
    .command("obligations")
    .description("業態別義務（製造 · 製造販売 · 販売）")
    .option("--role <id>", "manufacturing | mah | distribution")
    .option("--json", "JSON output")
    .action((opts) => runJpMedicalDeviceObligations({ role: opts.role, json: opts.json }));

  const qms = cmd.command("qms").description("QMS 4 階層文書");
  qms
    .command("catalog")
    .option("--tier <n>", "1 | 2 | 3 | 4")
    .option("--json", "JSON output")
    .action((opts) => runJpMedicalDeviceQmsCatalog({ tier: opts.tier, json: opts.json }));
  qms
    .command("draft")
    .option("--doc <id>", "Document id e.g. QMS-MAN-001")
    .option("--all", "All QMS documents")
    .option("--write", "Write to docs/medical-device/qms/")
    .option("--json", "JSON output")
    .action((opts) => {
      if (!opts.all && !opts.doc) {
        console.error("Specify --doc or --all");
        process.exit(1);
      }
      runJpMedicalDeviceQmsDraft({
        doc: opts.doc ?? "",
        all: opts.all,
        write: opts.write,
        json: opts.json,
      });
    });

  const gvp = cmd.command("gvp").description("GVP 文書 · エスカレーション");
  gvp.command("catalog").option("--json", "JSON output").action((opts) => runJpMedicalDeviceGvpCatalog({ json: opts.json }));
  gvp
    .command("draft")
    .option("--doc <id>", "Document id e.g. GVP-001")
    .option("--all", "All GVP documents")
    .option("--write", "Write to docs/medical-device/gvp/")
    .option("--json", "JSON output")
    .action((opts) => {
      if (!opts.all && !opts.doc) {
        console.error("Specify --doc or --all");
        process.exit(1);
      }
      runJpMedicalDeviceGvpDraft({
        doc: opts.doc ?? "",
        all: opts.all,
        write: opts.write,
        json: opts.json,
      });
    });
  gvp
    .command("escalate")
    .description("有害事象を安全管理責任者へエスカレ（提出は人間）")
    .requiredOption("--id <id>", "AE id")
    .option("--propose-approval", "org approval (medical_device.gvp_report)")
    .option("--proposed-by <name>", "proposer")
    .option("--no-work-order", "Skip Work Order creation")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceGvpEscalate({
        id: opts.id,
        proposeApproval: opts.proposeApproval,
        proposedBy: opts.proposedBy,
        noWorkOrder: opts.noWorkOrder,
        actor: opts.actor,
        json: opts.json,
      })
    );

  const ledger = cmd.command("ledger").description("各種台帳");
  ledger.command("list").option("--json", "JSON output").action((opts) => runJpMedicalDeviceLedgerList({ json: opts.json }));
  ledger
    .command("status")
    .option("--json", "JSON output")
    .action((opts) => runJpMedicalDeviceLedgerStatus({ json: opts.json }));
  ledger
    .command("add")
    .description("型付きエントリ追加 (--fields JSON)")
    .requiredOption("--type <type>", "ledger type")
    .option("--fields <json>", "JSON fields", "{}")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceLedgerAdd({
        type: opts.type,
        jsonFields: opts.fields,
        actor: opts.actor,
        json: opts.json,
      })
    );
  ledger
    .command("close")
    .requiredOption("--type <type>", "ledger type")
    .requiredOption("--id <id>", "entry id")
    .option("--force", "bypass capa/inquiry gates")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceLedgerClose({
        type: opts.type,
        id: opts.id,
        force: opts.force,
        actor: opts.actor,
        json: opts.json,
      })
    );

  const capa = cmd.command("capa").description("CAPA · 是正処置");
  capa
    .command("open")
    .requiredOption("--source <src>", "complaint|ae|audit|change|pms")
    .requiredOption("--title <title>", "title")
    .option("--source-ref <id>", "source entry id")
    .option("--due-on <date>", "YYYY-MM-DD")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceCapaOpen({
        source: opts.source,
        title: opts.title,
        sourceRef: opts.sourceRef,
        dueOn: opts.dueOn,
        actor: opts.actor,
        json: opts.json,
      })
    );
  capa
    .command("list")
    .option("--open", "open only")
    .option("--json", "JSON output")
    .action((opts) => runJpMedicalDeviceCapaList({ open: opts.open, json: opts.json }));
  capa
    .command("schedule-effectiveness")
    .requiredOption("--id <id>", "CAPA id")
    .requiredOption("--on <date>", "YYYY-MM-DD effectiveness check due")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceCapaScheduleEffectiveness({
        id: opts.id,
        on: opts.on,
        actor: opts.actor,
        json: opts.json,
      })
    );
  capa
    .command("record-effectiveness")
    .requiredOption("--id <id>", "CAPA id")
    .requiredOption("--result <r>", "effective|ineffective")
    .option("--notes <text>", "notes")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceCapaRecordEffectiveness({
        id: opts.id,
        result: opts.result,
        notes: opts.notes,
        actor: opts.actor,
        json: opts.json,
      })
    );
  capa
    .command("close")
    .requiredOption("--id <id>", "CAPA id")
    .option("--propose-approval", "org approval gate")
    .option("--proposed-by <name>", "proposer")
    .option("--force", "close without effective result when check was scheduled")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceCapaClose({
        id: opts.id,
        proposeApproval: opts.proposeApproval,
        proposedBy: opts.proposedBy,
        force: opts.force,
        actor: opts.actor,
        json: opts.json,
      })
    );

  const change = cmd.command("change").description("変更管理");
  change
    .command("open")
    .requiredOption("--type <type>", "design|process|labeling|supplier|qms_doc")
    .requiredOption("--title <title>", "title")
    .option("--device-id <id>", "device id")
    .option("--risk-review <text>", "risk note")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceChangeOpen({
        changeType: opts.type,
        title: opts.title,
        deviceId: opts.deviceId,
        riskReview: opts.riskReview,
        actor: opts.actor,
        json: opts.json,
      })
    );
  change
    .command("list")
    .option("--open", "open only")
    .option("--json", "JSON output")
    .action((opts) => runJpMedicalDeviceChangeList({ open: opts.open, json: opts.json }));
  change
    .command("propose-implement")
    .requiredOption("--id <id>", "CHG id")
    .requiredOption("--proposed-by <name>", "proposer")
    .option("--force", "allow without risk_review")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceChangeProposeImplement({
        id: opts.id,
        proposedBy: opts.proposedBy,
        force: opts.force,
        actor: opts.actor,
        json: opts.json,
      })
    );

  const inquiry = cmd.command("inquiry").description("当局照会");
  inquiry
    .command("open")
    .requiredOption("--authority <a>", "pmda|prefecture|cert_body|other")
    .requiredOption("--title <title>", "title")
    .option("--due-on <date>", "YYYY-MM-DD")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceInquiryOpen({
        authority: opts.authority,
        title: opts.title,
        dueOn: opts.dueOn,
        actor: opts.actor,
        json: opts.json,
      })
    );
  inquiry
    .command("list")
    .option("--open", "open only")
    .option("--json", "JSON output")
    .action((opts) => runJpMedicalDeviceInquiryList({ open: opts.open, json: opts.json }));
  inquiry
    .command("set-response")
    .description("回答ドラフトパスを記録（提出は人間）")
    .requiredOption("--id <id>", "INQ id")
    .requiredOption("--path <path>", "docs relative or absolute draft path")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceInquirySetResponse({
        id: opts.id,
        path: opts.path,
        actor: opts.actor,
        json: opts.json,
      })
    );
  inquiry
    .command("close")
    .description("照会クローズ（response_draft_path 必須）")
    .requiredOption("--id <id>", "INQ id")
    .option("--responded-on <date>", "YYYY-MM-DD")
    .option("--force", "close without response_draft_path")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceInquiryClose({
        id: opts.id,
        respondedOn: opts.respondedOn,
        force: opts.force,
        actor: opts.actor,
        json: opts.json,
      })
    );

  const pms = cmd.command("pms").description("市販後調査（PMS）");
  pms
    .command("open")
    .requiredOption("--device-id <id>", "device id")
    .requiredOption("--plan-period <text>", "e.g. 2026")
    .option("--next-review-on <date>", "YYYY-MM-DD")
    .option("--data-sources <csv>", "comma-separated")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDevicePmsOpen({
        deviceId: opts.deviceId,
        planPeriod: opts.planPeriod,
        nextReviewOn: opts.nextReviewOn,
        dataSources: opts.dataSources,
        actor: opts.actor,
        json: opts.json,
      })
    );
  pms
    .command("list")
    .option("--open", "open only")
    .option("--json", "JSON output")
    .action((opts) => runJpMedicalDevicePmsList({ open: opts.open, json: opts.json }));
  pms
    .command("review")
    .requiredOption("--id <id>", "PMS id")
    .requiredOption("--next-review-on <date>", "YYYY-MM-DD")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDevicePmsReview({
        id: opts.id,
        nextReviewOn: opts.nextReviewOn,
        actor: opts.actor,
        json: opts.json,
      })
    );

  const application = cmd.command("application").description("品目申請資料ドラフト（提出は人間）");
  application
    .command("catalog")
    .option("--json", "JSON output")
    .action((opts) => runJpMedicalDeviceApplicationCatalog({ json: opts.json }));
  application
    .command("draft")
    .requiredOption("--kind <kind>", "certification|partial-change|notification")
    .option("--device-id <id>", "device id")
    .option("--write", "Write to docs/medical-device/applications/")
    .option("--force", "Allow placeholder/incomplete device fields (demo)")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceApplicationDraft({
        kind: opts.kind,
        deviceId: opts.deviceId,
        write: opts.write,
        force: opts.force,
        json: opts.json,
      })
    );

  const audit = cmd.command("audit").description("運用監査証跡 (audit.jsonl)");
  audit
    .command("list")
    .option("--limit <n>", "max rows", "50")
    .option("--op <op>", "filter op")
    .option("--entity-id <id>", "filter entity")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceAuditList({
        limit: opts.limit ? Number(opts.limit) : 50,
        op: opts.op,
        entityId: opts.entityId,
        json: opts.json,
      })
    );

  cmd
    .command("complaint-add")
    .description("苦情エントリ追加（分類付き）")
    .option("--summary <text>", "summary")
    .option("--severity <s>", "minor|major|critical")
    .option("--defect-class <c>", "quality|safety|labeling|use_error|other")
    .option("--device-id <id>", "device id")
    .option("--reportable", "reportable")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceComplaintAdd({
        summary: opts.summary,
        severity: opts.severity,
        defectClass: opts.defectClass,
        deviceId: opts.deviceId,
        reportable: opts.reportable,
        actor: opts.actor,
        json: opts.json,
      })
    );

  cmd
    .command("ae-add")
    .description("有害事象追加（GVP due 自動計算）")
    .option("--summary <text>", "summary")
    .option("--seriousness <s>", "death|serious|other")
    .option("--device-id <id>", "device id")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceAeAdd({
        summary: opts.summary,
        seriousness: opts.seriousness,
        deviceId: opts.deviceId,
        actor: opts.actor,
        json: opts.json,
      })
    );

  cmd
    .command("ae-mark-filed")
    .description("GVP 提出事実を記録（report_filed_on · 提出は人間）")
    .requiredOption("--id <id>", "AE id")
    .option("--on <date>", "YYYY-MM-DD filed date")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceAeMarkFiled({
        id: opts.id,
        on: opts.on,
        actor: opts.actor,
        json: opts.json,
      })
    );

  cmd
    .command("complaint-promote-ae")
    .description("苦情から有害事象へ昇格")
    .requiredOption("--id <id>", "complaint id")
    .option("--seriousness <s>", "death|serious|other")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceComplaintPromoteAe({
        id: opts.id,
        seriousness: opts.seriousness,
        actor: opts.actor,
        json: opts.json,
      })
    );

  cmd
    .command("doc-propose-approval")
    .description("文書改訂の org approval 起票")
    .requiredOption("--id <id>", "document_control entry id")
    .requiredOption("--proposed-by <name>", "proposer")
    .option("--actor <id>", "audit actor")
    .option("--json", "JSON output")
    .action((opts) =>
      runJpMedicalDeviceDocProposeApproval({
        id: opts.id,
        proposedBy: opts.proposedBy,
        actor: opts.actor,
        json: opts.json,
      })
    );
}

export const jp_medical_deviceCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerMedicalDeviceCommands(ctx.operationsCmd);
  },
};
