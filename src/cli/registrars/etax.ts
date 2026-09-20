import type { Command } from "commander";
import {
  runEtaxApprove,
  runEtaxApprovePropose,
  runEtaxBuild,
  runEtaxProductionEnable,
  runEtaxProductionReview,
  runEtaxReady,
  runEtaxReceipt,
  runEtaxSign,
  runEtaxSpecFetch,
  runEtaxSpecStatus,
  runEtaxSpecUnpack,
  runEtaxStatus,
  runEtaxSubmit,
  runEtaxTransmissionTestStatus,
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
    .description("NTA e-Tax integration (KSK2). EXPERIMENTAL / NOT FOR PRODUCTION ETAX SUBMISSION");

  const spec = etax.command("spec").description("KSK2 specification registry");
  spec
    .command("status")
    .description("Show KSK2 spec registration and production gate")
    .option("--json", "JSON output")
    .action((opts: { json?: boolean }) => runEtaxSpecStatus({ json: Boolean(opts.json) }));

  spec
    .command("fetch")
    .description("Retrieve listed KSK2 CABs into gitignored spec/vendor and record SHA-256")
    .option(
      "--ids <csv>",
      "Comma-separated artifact ids (default: e-tax01,03,07,08,10,18,19)"
    )
    .option("--no-unpack", "Hash only; do not unpack")
    .option("--force", "Re-download even if the CAB is already present")
    .option("--json", "JSON output")
    .action(async (opts: { ids?: string; unpack?: boolean; force?: boolean; json?: boolean }) => {
      await runEtaxSpecFetch({
        ids: opts.ids
          ?.split(",")
          .map((id) => id.trim())
          .filter(Boolean),
        unpack: opts.unpack !== false,
        force: Boolean(opts.force),
        json: Boolean(opts.json),
      });
    });

  spec
    .command("unpack")
    .description("Unpack already-retrieved KSK2 CABs (Shift-JIS names → ASCII-safe paths)")
    .option("--ids <csv>", "Comma-separated artifact ids")
    .option("--json", "JSON output")
    .action(async (opts: { ids?: string; json?: boolean }) => {
      await runEtaxSpecUnpack({
        ids: opts.ids
          ?.split(",")
          .map((id) => id.trim())
          .filter(Boolean),
        json: Boolean(opts.json),
      });
    });

  etax
    .command("build")
    .description("Create ReturnPackage from JSON (official XML needs mapping + unpacked XSD)")
    .option("--from <path>", "Return package JSON")
    .option("--out <path>", "Write generated official XML here")
    .option("--json", "JSON output")
    .action((opts: { from?: string; out?: string; json?: boolean }) =>
      runEtaxBuild({ from: opts.from, out: opts.out, json: Boolean(opts.json) })
    );

  etax
    .command("validate")
    .description(
      "Three-layer validation (XSD / procedure / OrgOS hash). Production remains disabled."
    )
    .argument("<submission-id>")
    .option("--xml <path>", "Official XML instance to validate (Layer 1)")
    .option("--env <mock|test|production>", "Procedure gate environment", "mock")
    .option("--json", "JSON output")
    .action((id: string, opts: { xml?: string; env?: string; json?: boolean }) =>
      runEtaxValidate({
        id,
        xml: opts.xml,
        env: parseEnv(opts.env),
        json: Boolean(opts.json),
      })
    );

  etax
    .command("approve")
    .description("Grant hash-bound org approval (ADR 0038). Propose first.")
    .argument("<submission-id>")
    .option("--approval-id <id>", "Pending or granted org approval id (APR-*)")
    .option("--json", "JSON output")
    .action((id: string, opts: { approvalId?: string; json?: boolean }) =>
      runEtaxApprove({ id, approvalId: opts.approvalId, json: Boolean(opts.json) })
    );

  etax
    .command("approve-propose")
    .description("Propose an org approval bound to the ReturnPackage contentHash")
    .argument("<submission-id>")
    .option("--json", "JSON output")
    .action((id: string, opts: { json?: boolean }) =>
      runEtaxApprovePropose({ id, json: Boolean(opts.json) })
    );

  etax
    .command("ready")
    .description("Mark a SIGNED submission READY_TO_SUBMIT (hash-bound)")
    .argument("<submission-id>")
    .option("--env <mock|test|production>", "Environment", "mock")
    .option("--json", "JSON output")
    .action((id: string, opts: { env?: string; json?: boolean }) =>
      runEtaxReady({ id, env: parseEnv(opts.env), json: Boolean(opts.json) })
    );

  etax
    .command("sign")
    .description(
      "Sign official XML via NTA module adapter. Mock is not legal. PIN is never a CLI flag."
    )
    .argument("<submission-id>")
    .option("--env <mock|test|production>", "Signature environment", "mock")
    .option("--provider <mock|official>", "Signature provider (mock only with --env mock)")
    .option("--xml <path>", "Official XML instance to sign (hash-bound)")
    .option("--json", "JSON output")
    .action(
      async (
        id: string,
        opts: { env?: string; provider?: string; xml?: string; json?: boolean }
      ) => {
        await runEtaxSign({
          id,
          env: parseEnv(opts.env),
          provider: opts.provider,
          xml: opts.xml,
          json: Boolean(opts.json),
        });
      }
    );

  etax
    .command("submit")
    .description("Submit to e-Tax transport. Production is fail-closed. Mock is not NTA.")
    .argument("<submission-id>")
    .option("--env <mock|test|production>", "Transport environment", "mock")
    .option("--xml <path>", "Official XML instance to submit (hash-bound)")
    .option("--json", "JSON output")
    .action((id: string, opts: { env?: string; xml?: string; json?: boolean }) =>
      runEtaxSubmit({
        id,
        env: parseEnv(opts.env),
        xml: opts.xml,
        json: Boolean(opts.json),
      })
    );

  etax
    .command("receipt")
    .description("Fetch e-Tax receipt. RECEIVED_BY_ETAX is not tax-correctness.")
    .argument("<submission-id>")
    .option("--env <mock|test|production>", "Transport environment", "mock")
    .option("--json", "JSON output")
    .action((id: string, opts: { env?: string; json?: boolean }) =>
      runEtaxReceipt({ id, env: parseEnv(opts.env), json: Boolean(opts.json) })
    );

  const production = etax.command("production").description("Production enablement (fail-closed)");
  production
    .command("review")
    .description("Show the Phase 8 checklist. Does not enable production.")
    .option("--json", "JSON output")
    .action((opts: { json?: boolean }) => runEtaxProductionReview({ json: Boolean(opts.json) }));
  production
    .command("enable")
    .description("Refused: CLI cannot flip production-gate.yaml")
    .action(() => runEtaxProductionEnable());

  etax
    .command("transmission-test")
    .description("NTA KSK2 transmission test status (Phase 7). Not executed.")
    .command("status")
    .option("--json", "JSON output")
    .action((opts: { json?: boolean }) =>
      runEtaxTransmissionTestStatus({ json: Boolean(opts.json) })
    );

  etax
    .command("status")
    .description("Submission or module status")
    .argument("[submission-id]")
    .option("--json", "JSON output")
    .action((id: string | undefined, opts: { json?: boolean }) =>
      runEtaxStatus({ id, json: Boolean(opts.json) })
    );
}
