import type { Command } from "commander";
import {
  runEtaxApprove,
  runEtaxBuild,
  runEtaxReceipt,
  runEtaxSign,
  runEtaxSpecStatus,
  runEtaxStatus,
  runEtaxSubmit,
  runEtaxValidate,
} from "../../commands/etax.js";
import type { EtaxEnvironment } from "../../../schemas/etax/submission-state.js";

function parseEnv(raw: string | undefined): EtaxEnvironment {
  if (raw === "mock" || raw === "test" || raw === "production") return raw;
  return "mock";
}

export function registerEtaxCommands(program: Command): void {
  registerEtaxCommandTree(program);
}

export function registerEtaxCommandTree(parent: Command): void {
  const etax = parent
    .command("etax")
    .description(
      "NTA e-Tax integration (KSK2). EXPERIMENTAL / NOT FOR PRODUCTION ETAX SUBMISSION",
    );

  const spec = etax.command("spec").description("KSK2 specification registry");
  spec
    .command("status")
    .description("Show KSK2 spec registration and production gate")
    .option("--json", "JSON output")
    .action((opts: { json?: boolean }) => runEtaxSpecStatus({ json: Boolean(opts.json) }));

  etax
    .command("build")
    .description("Create ReturnPackage from JSON (official XML is SPEC_BLOCKED until XSD is registered)")
    .option("--from <path>", "Return package JSON")
    .option("--json", "JSON output")
    .action((opts: { from?: string; json?: boolean }) =>
      runEtaxBuild({ from: opts.from, json: Boolean(opts.json) }),
    );

  etax
    .command("validate")
    .description("Validate a submission (Layer 1/2 SPEC_BLOCKED until official XSD)")
    .argument("<submission-id>")
    .option("--json", "JSON output")
    .action((id: string, opts: { json?: boolean }) =>
      runEtaxValidate({ id, json: Boolean(opts.json) }),
    );

  etax
    .command("approve")
    .description("Human approval bound to contentHash (Phase 6)")
    .argument("<submission-id>")
    .option("--json", "JSON output")
    .action((id: string, opts: { json?: boolean }) =>
      runEtaxApprove({ id, json: Boolean(opts.json) }),
    );

  etax
    .command("sign")
    .description("Electronic signature via NTA module adapter (Phase 3)")
    .argument("<submission-id>")
    .option("--json", "JSON output")
    .action((id: string, opts: { json?: boolean }) =>
      runEtaxSign({ id, json: Boolean(opts.json) }),
    );

  etax
    .command("submit")
    .description("Submit to e-Tax transport. Production is fail-closed.")
    .argument("<submission-id>")
    .option("--env <mock|test|production>", "Transport environment", "mock")
    .option("--json", "JSON output")
    .action((id: string, opts: { env?: string; json?: boolean }) =>
      runEtaxSubmit({
        id,
        env: parseEnv(opts.env),
        json: Boolean(opts.json),
      }),
    );

  etax
    .command("receipt")
    .description("Fetch e-Tax receipt (Phase 5)")
    .argument("<submission-id>")
    .option("--json", "JSON output")
    .action((id: string, opts: { json?: boolean }) =>
      runEtaxReceipt({ id, json: Boolean(opts.json) }),
    );

  etax
    .command("status")
    .description("Submission or module status")
    .argument("[submission-id]")
    .option("--json", "JSON output")
    .action((id: string | undefined, opts: { json?: boolean }) =>
      runEtaxStatus({ id, json: Boolean(opts.json) }),
    );
}
