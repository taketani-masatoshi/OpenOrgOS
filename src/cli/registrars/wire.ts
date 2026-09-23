import type { Command } from "commander";
import {
  runWireGatewayDiscover,
  runWireGatewayDiscoverApply,
  runWireGatewayInit,
  runWireGatewayScore,
  runWireGatewayServe,
  runWireGatewayValidate,
} from "../../commands/wire-gateway.js";
import { runWireLiveVerifyCommand } from "../../commands/wire-live-verify.js";
import {
  defineDeliverEnvelopeCommand,
  defineDeliverFlushPendingCommand,
  defineDeliverPullCommand,
  defineDeliverStatusCommand,
  definePeerDiscoverCommand,
  definePeerMigrateLegacyCommand,
  definePeerRegisterCommand,
  defineWitnessFlushPendingCommand,
  defineWitnessPoolInitTrustedCommand,
  defineWitnessPoolStatusCommand,
  defineWitnessRegisterCommand,
  defineWitnessVerifyCommand,
} from "./protocol/shared-command-defs.js";

function child(parent: Command, name: string): Command | undefined {
  return parent.commands.find((candidate) => candidate.name() === name);
}

function getOrCreate(parent: Command, name: string, description: string): Command {
  const existing = child(parent, name);
  if (existing) {
    existing.description(description);
    return existing;
  }
  return parent.command(name).description(description);
}

/**
 * Canonical external Wire facade.
 *
 * Historical `protocol`, `wire-gateway`, and `hub` roots remain registered by
 * their compatibility registrars. This facade intentionally delegates to the
 * same handlers so no storage or runtime behaviour changes.
 */
export function registerCanonicalWireCommands(program: Command): void {
  const wire = getOrCreate(
    program,
    "wire",
    "Canonical inter-org Wire facade (gateway · peer · delivery · witness · score)"
  );

  const gateway = getOrCreate(wire, "gateway", "Wire Gateway lifecycle and discovery");
  gateway
    .command("serve")
    .description("Start the external Wire Gateway")
    .option("--tenant <id>", "Tenant id")
    .option("--host <host>", "Override listen host")
    .option("--port <n>", "Override listen port")
    .option("--public-base-url <url>", "Public URL behind reverse proxy")
    .option("--tls-cert <path>", "TLS certificate PEM")
    .option("--tls-key <path>", "TLS private key PEM")
    .option("--no-outbound", "Disable outbox polling")
    .action((opts) =>
      runWireGatewayServe({
        tenant: opts.tenant,
        host: opts.host,
        port: opts.port ? Number(opts.port) : undefined,
        publicBaseUrl: opts.publicBaseUrl,
        tlsCert: opts.tlsCert,
        tlsKey: opts.tlsKey,
        noOutbound: opts.noOutbound,
      })
    );
  gateway
    .command("init")
    .description("Initialize wire-gateway.yaml")
    .option("--tenant <id>", "Tenant id")
    .option("--force", "Overwrite existing config")
    .option("--json", "JSON output")
    .action((opts) =>
      runWireGatewayInit({ tenant: opts.tenant, force: opts.force, json: opts.json })
    );
  gateway
    .command("validate")
    .description("Validate wire-gateway.yaml")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runWireGatewayValidate({ tenant: opts.tenant, json: opts.json }));
  gateway
    .command("discover")
    .description("Discover or register trust-registry Wire nodes")
    .option("--tenant <id>", "Tenant id")
    .option("--jurisdiction <code>", "Filter by jurisdiction")
    .option("--suggest", "Print peer registration suggestions")
    .option("--apply", "Register unregistered nodes")
    .option("--dry-run", "Preview --apply")
    .option(
      "--node-id <id>",
      "Limit --apply to node_id (repeatable)",
      (value: string, previous: string[]) => [...previous, value],
      [] as string[]
    )
    .option("--json", "JSON output")
    .action((opts) =>
      opts.apply
        ? runWireGatewayDiscoverApply({
            tenant: opts.tenant,
            jurisdiction: opts.jurisdiction,
            dryRun: opts.dryRun,
            nodeId: opts.nodeId?.length ? opts.nodeId : undefined,
            json: opts.json,
          })
        : runWireGatewayDiscover({
            tenant: opts.tenant,
            jurisdiction: opts.jurisdiction,
            suggest: opts.suggest,
            json: opts.json,
          })
    );

  const peer = getOrCreate(wire, "peer", "External organization peer registry");
  definePeerRegisterCommand(peer);
  definePeerDiscoverCommand(peer);
  definePeerMigrateLegacyCommand(peer);

  const delivery = getOrCreate(wire, "delivery", "Wire envelope delivery and retry state");
  defineDeliverEnvelopeCommand(delivery, "send", "Send an envelope to a peer");
  defineDeliverStatusCommand(delivery);
  defineDeliverFlushPendingCommand(delivery);
  defineDeliverPullCommand(delivery);

  const witness = getOrCreate(wire, "witness", "Distributed Wire witness attestations");
  defineWitnessRegisterCommand(witness);
  defineWitnessVerifyCommand(witness);
  defineWitnessFlushPendingCommand(witness);
  const pool = witness.command("pool").description("Witness pool lifecycle");
  defineWitnessPoolStatusCommand(pool);
  defineWitnessPoolInitTrustedCommand(pool);

  wire
    .command("score")
    .description("Wire implementation score")
    .option("--strict", "Run focused mapped test evidence")
    .option("--json", "JSON output")
    .action((opts) => runWireGatewayScore(opts));
  wire
    .command("live-verify")
    .description("Env-gated live Wire verification (requires ORGOS_LIVE_VERIFY=1)")
    .option("--tenant <id>", "Tenant id", "mal")
    .option("--public-base-url <url>", "Public Wire base URL")
    .option("--roundtrip", "Also run Phase 4 email_wire live roundtrip")
    .option(
      "--strict-email-wire",
      "Fail when email_wire readiness is not OK (or set ORGOS_LIVE_VERIFY_STRICT_EMAIL=1)"
    )
    .option("--json", "JSON output")
    .option("--no-evidence", "Skip writing scratch/wire-live-verify-*.json")
    .action(async (opts: {
      tenant?: string;
      publicBaseUrl?: string;
      roundtrip?: boolean;
      strictEmailWire?: boolean;
      json?: boolean;
      noEvidence?: boolean;
    }) =>
      runWireLiveVerifyCommand({
        tenant: opts.tenant,
        publicBaseUrl: opts.publicBaseUrl,
        roundtrip: opts.roundtrip,
        strictEmailWire: opts.strictEmailWire,
        json: opts.json,
        noEvidence: opts.noEvidence,
      })
    );
}
