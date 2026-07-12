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
  runProtocolPeerDiscover,
  runProtocolPeerRegister,
  runProtocolPeersMigrateLegacy,
} from "../../commands/protocol/peer.js";
import {
  runProtocolDeliver,
  runProtocolDeliverFlushPending,
  runProtocolDeliverPull,
  runProtocolDeliverStatus,
} from "../../commands/protocol/delivery.js";
import {
  runProtocolWitnessFlushPending,
  runProtocolWitnessPoolInitTrusted,
  runProtocolWitnessPoolStatus,
  runProtocolWitnessRegister,
  runProtocolWitnessVerify,
} from "../../commands/protocol/witness.js";

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
  peer
    .command("register")
    .description("Register a Wire peer")
    .requiredOption("--name <text>", "Display name")
    .requiredOption("--jurisdiction <code>", "Jurisdiction")
    .option("--stakeholder <id>", "STK-* link")
    .option("--peer-id <id>", "Override PEER-* id")
    .option("--org-uri <uri>", "steward://tenant/...")
    .option("--public-key <b64>", "Base64 SPKI public key")
    .option("--identity-file <path>", "Identity JSON")
    .option("--webhook-url <url>", "Deprecated legacy Wire endpoint (not orgos webhook)")
    .option("--tenant <id>", "Tenant id")
    .action((opts) =>
      runProtocolPeerRegister({
        name: opts.name,
        jurisdiction: opts.jurisdiction,
        stakeholder: opts.stakeholder,
        peerId: opts.peerId,
        orgUri: opts.orgUri,
        publicKey: opts.publicKey,
        identityFile: opts.identityFile,
        webhookUrl: opts.webhookUrl,
        tenant: opts.tenant,
      })
    );
  peer
    .command("discover")
    .description("List registered and discoverable peers")
    .option("--jurisdiction <code>", "Jurisdiction")
    .option("--tenant <id>", "Tenant id")
    .option("--suggest", "Print registration suggestions")
    .option("--json", "JSON output")
    .action((opts) => runProtocolPeerDiscover(opts));
  peer
    .command("migrate-legacy")
    .description("Migrate legacy_webhook before 2026-10-01 (Wire transport; not orgos webhook)")
    .option("--tenant <id>", "Tenant id")
    .option("--apply", "Write peers.yaml (default: dry-run)")
    .option("--to-wire-url <url>", "Replace legacy endpoint with wire_v1 URL")
    .option("--json", "JSON output")
    .action((opts) => runProtocolPeersMigrateLegacy(opts));

  const delivery = getOrCreate(wire, "delivery", "Wire envelope delivery and retry state");
  delivery
    .command("send")
    .description("Send an envelope to a peer")
    .requiredOption("--peer <id>", "PEER-*")
    .requiredOption("--file <path>", "Envelope JSON")
    .option("--tenant <id>", "Tenant id")
    .action((opts) => runProtocolDeliver(opts));
  delivery
    .command("status")
    .description("Show delivery attempts")
    .requiredOption("--event-id <uuid>", "Event id")
    .option("--peer <id>", "Peer id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolDeliverStatus({ eventId: opts.eventId, peerId: opts.peer, json: opts.json })
    );
  delivery
    .command("flush-pending")
    .description("Retry queued Wire deliveries")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolDeliverFlushPending(opts));
  delivery
    .command("pull")
    .description("Pull an envelope from a peer outbox")
    .requiredOption("--peer <id>", "PEER-*")
    .requiredOption("--event-id <uuid>", "Event id")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolDeliverPull(opts));

  const witness = getOrCreate(wire, "witness", "Distributed Wire witness attestations");
  witness
    .command("register")
    .description("Register an event attestation")
    .requiredOption("--event-id <uuid>", "Event id")
    .requiredOption("--side <side>", "sent | received")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolWitnessRegister(opts));
  witness
    .command("verify")
    .description("Verify witness receipts and quorum")
    .requiredOption("--event-id <uuid>", "Event id")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolWitnessVerify(opts));
  witness
    .command("flush-pending")
    .description("Retry pending witness attestations")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolWitnessFlushPending(opts));
  const pool = witness.command("pool").description("Witness pool lifecycle");
  pool
    .command("status")
    .description("Check configured witness hubs")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolWitnessPoolStatus(opts));
  pool
    .command("init-trusted")
    .description("Initialize pool from trusted hubs")
    .option("--jurisdiction <code>", "Jurisdiction")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolWitnessPoolInitTrusted(opts));

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
    .action(
      async (opts: {
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
