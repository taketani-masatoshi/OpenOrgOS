import type { Command } from "commander";
import type { ModuleCliBundle } from "../../../../../../src/lib/module-cli-types.js";
import {
  runJpMedicalDeviceGvpCatalog,
  runJpMedicalDeviceGvpDraft,
  runJpMedicalDeviceLedgerList,
  runJpMedicalDeviceLedgerStatus,
  runJpMedicalDeviceObligations,
  runJpMedicalDeviceQmsCatalog,
  runJpMedicalDeviceQmsDraft,
  runJpMedicalDeviceShow,
  runJpMedicalDeviceValidate,
} from "./commands.js";

export const MODULE_ID = "jp_medical_device";

function registerMedicalDeviceCommands(operationsCmd: Command): void {
  const cmd = operationsCmd
    .command("medical-device")
    .description("JP medical device — QMS · GVP · 台帳 (jp_medical_device)");

  cmd.command("show").option("--json", "JSON output").action((opts) => runJpMedicalDeviceShow({ json: opts.json }));

  cmd.command("validate").action(() => runJpMedicalDeviceValidate());

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

  const gvp = cmd.command("gvp").description("GVP 文書");
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

  const ledger = cmd.command("ledger").description("各種台帳");
  ledger.command("list").option("--json", "JSON output").action((opts) => runJpMedicalDeviceLedgerList({ json: opts.json }));
  ledger.command("status").option("--json", "JSON output").action((opts) => runJpMedicalDeviceLedgerStatus({ json: opts.json }));
}

export const jp_medical_deviceCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    registerMedicalDeviceCommands(ctx.operationsCmd);
  },
};
