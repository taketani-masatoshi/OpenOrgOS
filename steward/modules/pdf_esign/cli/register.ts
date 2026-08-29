import type { ModuleCliBundle } from "../../../../src/lib/module-cli-types.js";
import {
  runEsignAcceptLive,
  runEsignAttachContainer,
  runEsignCreate,
  runEsignEndpointsSet,
  runEsignEndpointsShow,
  runEsignList,
  runEsignPrepare,
  runEsignReady,
  runEsignSend,
  runEsignVerifyDigidoc,
} from "../../../../src/commands/operations-esign.js";

export const MODULE_ID = "pdf_esign";

/** `orgos operations esign …` — national eID (DigiDoc / SiVa). */
export const pdfEsignCli: ModuleCliBundle = {
  moduleId: MODULE_ID,
  register(ctx) {
    const esign = ctx.operationsCmd
      .command("esign")
      .description("National eID signing (DigiDoc · SiVa) — humans sign with their own card");

    esign
      .command("ready")
      .description("SiVa / sidecar readiness (no secrets)")
      .option("--json", "JSON output")
      .action(async (opts) => runEsignReady({ json: opts.json }));

    const endpoints = esign
      .command("endpoints")
      .description("SiVa / sidecar connection settings (gitignored 0600 store)");

    endpoints
      .command("show")
      .description("Masked snapshot — the sidecar token is never printed")
      .option("--json", "JSON output")
      .action((opts) => runEsignEndpointsShow({ json: opts.json }));

    endpoints
      .command("set")
      .description("Persist connection settings without touching deploy env")
      .option("--siva-url <url>", "SiVa base URL")
      .option("--siva-mode <mode>", "live | mock")
      .option("--sidecar-url <url>", "digidoc4j sidecar base URL")
      .option("--sidecar-token <token>", "Bearer token for the sidecar")
      .option("--allow-http-loopback <bool>", "Allow plaintext loopback endpoints")
      .option("--json", "JSON output")
      .action((opts) =>
        runEsignEndpointsSet({
          sivaUrl: opts.sivaUrl,
          sivaMode: opts.sivaMode,
          sidecarUrl: opts.sidecarUrl,
          sidecarToken: opts.sidecarToken,
          allowHttpLoopback: opts.allowHttpLoopback,
          json: opts.json,
        }),
      );

    esign
      .command("list")
      .description("List signing cases")
      .option("--json", "JSON output")
      .action((opts) => runEsignList({ json: opts.json }));

    esign
      .command("create")
      .description("Create a signing case from a PDF")
      .requiredOption("--pdf <path>", "Source PDF")
      .requiredOption("--title <text>", "Case title")
      .option("--provider <id>", "digidoc | manual", "digidoc")
      .option("--contract-id <id>", "Linked contract")
      .option("--approval-id <id>", "Linked approval")
      .option("--json", "JSON output")
      .action((opts) => {
        runEsignCreate({
          pdf: opts.pdf,
          title: opts.title,
          provider: opts.provider,
          contractId: opts.contractId,
          approvalId: opts.approvalId,
          json: opts.json,
        });
      });

    esign
      .command("prepare")
      .description("Build an unsigned ASiC-E skeleton via the digidoc4j sidecar")
      .requiredOption("--id <id>", "ES-YYYY-NNN")
      .option("--json", "JSON output")
      .action(async (opts) => runEsignPrepare({ id: opts.id, json: opts.json }));

    esign
      .command("send")
      .description("Hand the case to the signer (DigiDoc4 + national card)")
      .requiredOption("--id <id>", "ES-YYYY-NNN")
      .option("--json", "JSON output")
      .action(async (opts) => runEsignSend({ id: opts.id, json: opts.json }));

    esign
      .command("attach-container")
      .description("Attach a signed .asice container")
      .requiredOption("--id <id>", "ES-YYYY-NNN")
      .requiredOption("--asice <path>", "Signed .asice")
      .option("--json", "JSON output")
      .action((opts) => {
        runEsignAttachContainer({ id: opts.id, asice: opts.asice, json: opts.json });
      });

    esign
      .command("verify-digidoc")
      .description("Validate the attached container with SiVa")
      .requiredOption("--id <id>", "ES-YYYY-NNN")
      .option("--siva-mode <mode>", "live | mock (mock never completes a case)")
      .option("--json", "JSON output")
      .action(async (opts) =>
        runEsignVerifyDigidoc({
          id: opts.id,
          sivaMode: opts.sivaMode === "mock" ? "mock" : opts.sivaMode === "live" ? "live" : undefined,
          json: opts.json,
        }),
      );

    esign
      .command("accept-live")
      .description("Attach a signed container and verify it with live SiVa")
      .requiredOption("--id <id>", "ES-YYYY-NNN")
      .requiredOption("--asice <path>", "Signed .asice")
      .option("--json", "JSON output")
      .action(async (opts) =>
        runEsignAcceptLive({ id: opts.id, asice: opts.asice, json: opts.json }),
      );
  },
};
