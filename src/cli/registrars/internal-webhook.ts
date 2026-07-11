import type { Command } from "commander";
import {
  runWebhookConfig,
  runWebhookIngest,
  runWebhookSend,
  runWebhookServe,
} from "../../commands/webhook.js";

/** Internal automation webhook; unrelated to Wire's deprecated legacy_webhook transport. */
export function registerInternalWebhookCommands(program: Command): void {
  const webhook = program
    .command("webhook")
    .description(
      "Internal OrgOS automation webhook (queue integration; not Wire legacy_webhook transport)"
    );
  webhook.command("config").description("Show internal webhook registry").action(runWebhookConfig);
  webhook
    .command("send")
    .description("Send internal outbound automation webhook")
    .requiredOption("--event <name>", "Event name")
    .option("--ref <id>", "Reference id")
    .option("--payload <file|json>", "Payload file or JSON string")
    .action((opts) => runWebhookSend({ event: opts.event, ref: opts.ref, payload: opts.payload }));
  webhook
    .command("ingest")
    .description("Ingest internal webhook payload into the OrgOS queue")
    .requiredOption("--file <path>", "JSON payload file")
    .option("--secret <secret>", "Override secret")
    .action((opts) => runWebhookIngest({ file: opts.file, secret: opts.secret }));
  webhook
    .command("serve")
    .description("Start internal automation webhook HTTP server")
    .option("--host <host>", "Bind host")
    .option("--port <port>", "Bind port")
    .option("--once", "Start and exit (health check)")
    .action((opts) =>
      runWebhookServe({
        host: opts.host,
        port: opts.port ? Number(opts.port) : undefined,
        once: opts.once,
      })
    );
}
