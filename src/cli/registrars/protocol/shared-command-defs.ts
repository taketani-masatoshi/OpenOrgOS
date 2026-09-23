import type { Command } from "commander";
import {
  runProtocolPeerDiscover,
  runProtocolPeerRegister,
  runProtocolPeersMigrateLegacy,
} from "../../../commands/protocol/peer.js";
import {
  runProtocolDeliver,
  runProtocolDeliverFlushPending,
  runProtocolDeliverPull,
  runProtocolDeliverStatus,
} from "../../../commands/protocol/delivery.js";
import {
  runProtocolWitnessFlushPending,
  runProtocolWitnessPoolInitTrusted,
  runProtocolWitnessPoolStatus,
  runProtocolWitnessRegister,
  runProtocolWitnessVerify,
} from "../../../commands/protocol/witness.js";

/** Peer register options shared by `orgos wire peer` and `orgos protocol peer`. */
export function definePeerRegisterCommand(parent: Command): Command {
  return parent
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
}

export function definePeerDiscoverCommand(parent: Command): Command {
  return parent
    .command("discover")
    .description("List registered and discoverable peers")
    .option("--jurisdiction <code>", "Jurisdiction")
    .option("--tenant <id>", "Tenant id")
    .option("--suggest", "Print registration suggestions")
    .option("--json", "JSON output")
    .action((opts) => runProtocolPeerDiscover(opts));
}

export function definePeerMigrateLegacyCommand(parent: Command): Command {
  return parent
    .command("migrate-legacy")
    .description(
      "Migrate legacy_webhook before 2026-10-01 (Wire transport; not orgos webhook)"
    )
    .option("--tenant <id>", "Tenant id")
    .option("--apply", "Write peers.yaml (default: dry-run)")
    .option("--to-wire-url <url>", "Replace legacy endpoint with wire_v1 URL")
    .option("--json", "JSON output")
    .action((opts) => runProtocolPeersMigrateLegacy(opts));
}

/** Delivery send — wire uses command name `send`, protocol uses `deliver`. */
export function defineDeliverEnvelopeCommand(parent: Command, name: string, description: string): Command {
  return parent
    .command(name)
    .description(description)
    .requiredOption("--peer <id>", "PEER-*")
    .requiredOption("--file <path>", "Envelope JSON")
    .option("--tenant <id>", "Tenant id")
    .action((opts) => runProtocolDeliver(opts));
}

export function defineDeliverStatusCommand(parent: Command): Command {
  return parent
    .command("status")
    .description("Show delivery attempts")
    .requiredOption("--event-id <uuid>", "Event id")
    .option("--peer <id>", "Peer id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolDeliverStatus({ eventId: opts.eventId, peerId: opts.peer, json: opts.json })
    );
}

export function defineDeliverFlushPendingCommand(parent: Command, name = "flush-pending"): Command {
  return parent
    .command(name)
    .description("Retry queued Wire deliveries")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolDeliverFlushPending(opts));
}

export function defineDeliverPullCommand(parent: Command, name = "pull"): Command {
  return parent
    .command(name)
    .description("Pull an envelope from a peer outbox")
    .requiredOption("--peer <id>", "PEER-*")
    .requiredOption("--event-id <uuid>", "Event id")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolDeliverPull(opts));
}

export function defineWitnessRegisterCommand(parent: Command): Command {
  return parent
    .command("register")
    .description("Register an event attestation")
    .requiredOption("--event-id <uuid>", "Event id")
    .requiredOption("--side <side>", "sent | received")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolWitnessRegister(opts));
}

export function defineWitnessVerifyCommand(parent: Command): Command {
  return parent
    .command("verify")
    .description("Verify witness receipts and quorum")
    .requiredOption("--event-id <uuid>", "Event id")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolWitnessVerify(opts));
}

export function defineWitnessFlushPendingCommand(parent: Command): Command {
  return parent
    .command("flush-pending")
    .description("Retry pending witness attestations")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolWitnessFlushPending(opts));
}

export function defineWitnessPoolStatusCommand(parent: Command): Command {
  return parent
    .command("status")
    .description("Check configured witness hubs")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolWitnessPoolStatus(opts));
}

export function defineWitnessPoolInitTrustedCommand(parent: Command): Command {
  return parent
    .command("init-trusted")
    .description("Initialize pool from trusted hubs")
    .option("--jurisdiction <code>", "Jurisdiction")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolWitnessPoolInitTrusted(opts));
}
