import type { Command } from "commander";
import {
  runHubServe,
  runHubExportPublicKey,
  runHubVerify,
  runHubAnchorExport,
  runHubAnchorShow,
  runHubAnchorVerify,
  runHubGossipExport,
  runHubGossipAttestationExport,
  runHubFederationShow,
  runHubFederationAddPeer,
  runHubGossipSync,
  runHubTlsInit,
  runHubGaCheck,
} from "../../../commands/hub.js";

/** Historical `orgos hub` root — Witness Hub reference node. */
export function registerHubCommands(program: Command): void {
  const hubCmd = program.command("hub").description("Witness Hub node (reference implementation)");
  hubCmd
    .command("serve")
    .description("Start witness hub HTTP/HTTPS server")
    .requiredOption("--hub-id <id>", "Hub node id (e.g. HUB-A)")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--host <host>", "Bind host", "127.0.0.1")
    .option("--port <n>", "Bind port", "9474")
    .option("--gossip-interval <sec>", "Background gossip sync interval (requires hub-federation.yaml)")
    .option("--tls-cert <path>", "TLS certificate PEM (enables HTTPS)")
    .option("--tls-key <path>", "TLS private key PEM")
    .option("--tls-ca <path>", "CA bundle for mTLS client verification")
    .option("--mtls-required", "Require client certificate")
    .action((opts) =>
      runHubServe({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        host: opts.host,
        port: Number(opts.port),
        gossipIntervalSec: opts.gossipInterval ? Number(opts.gossipInterval) : undefined,
        tlsCert: opts.tlsCert,
        tlsKey: opts.tlsKey,
        tlsCa: opts.tlsCa,
        mtlsRequired: opts.mtlsRequired,
      })
    );
  hubCmd
    .command("tls-init")
    .description("Generate dev TLS certs for witness hub (deploy/witness-hub/tls)")
    .option("--output-dir <path>", "TLS output directory")
    .option("--force", "Regenerate existing material")
    .option("--json", "JSON output")
    .action((opts) =>
      runHubTlsInit({
        outputDir: opts.outputDir,
        force: opts.force,
        json: opts.json,
      })
    );
  hubCmd
    .command("ga-check")
    .description("Public-relay GA checklist (TLS overlay, mTLS, metrics, trusted hubs)")
    .option("--json", "JSON output")
    .action((opts) => runHubGaCheck({ json: opts.json }));

  const hubFederationCmd = hubCmd.command("federation").description("Hub peer federation");
  hubFederationCmd
    .command("show")
    .description("Show hub-federation.yaml")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--json", "JSON output")
    .action((opts) =>
      runHubFederationShow({ hubId: opts.hubId, dataDir: opts.dataDir, json: opts.json })
    );
  hubFederationCmd
    .command("add-peer")
    .description("Add peer hub to hub-federation.yaml")
    .requiredOption("--hub-id <id>", "Local hub node id")
    .requiredOption("--peer-id <id>", "Peer hub id")
    .requiredOption("--peer-url <url>", "Peer hub base URL")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--public-key <b64>", "Peer hub public key (fetched if omitted)")
    .option("--priority <n>", "Peer priority", "1")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runHubFederationAddPeer({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        peerId: opts.peerId,
        peerUrl: opts.peerUrl,
        publicKey: opts.publicKey,
        priority: Number(opts.priority),
        json: opts.json,
      })
    );
  const hubGossipCmd = hubCmd.command("gossip").description("Hub gossip sync");
  hubGossipCmd
    .command("sync")
    .description("Pull attestations from federation peer(s)")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--peer <id>", "Single peer hub id (default: all peers)")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runHubGossipSync({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        peer: opts.peer,
        json: opts.json,
      })
    );
  hubGossipCmd
    .command("sync-all")
    .description("Pull attestations from all federation peers")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runHubGossipSync({ hubId: opts.hubId, dataDir: opts.dataDir, json: opts.json })
    );
  hubCmd
    .command("export-public-key")
    .description("Export hub Ed25519 public key (base64 SPKI)")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--json", "JSON output")
    .action((opts) =>
      runHubExportPublicKey({ hubId: opts.hubId, dataDir: opts.dataDir, json: opts.json })
    );
  hubCmd
    .command("verify")
    .description("Verify hub receipt for event_id (local data-dir or remote hub-url)")
    .requiredOption("--hub-id <id>", "Hub node id")
    .requiredOption("--event-id <uuid>", "Event id")
    .option("--data-dir <path>", "Hub data directory (local mode)")
    .option("--hub-url <url>", "Remote hub base URL")
    .option("--public-key <b64>", "Override hub public key")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runHubVerify({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        hubUrl: opts.hubUrl,
        eventId: opts.eventId,
        hubPublicKey: opts.publicKey,
        json: opts.json,
      })
    );
  hubCmd
    .command("anchor-show")
    .description("Show Merkle anchor for hub receipts on date")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--date <YYYY-MM-DD>", "Anchor date")
    .option("--json", "JSON output")
    .action((opts) =>
      runHubAnchorShow({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        date: opts.date,
        json: opts.json,
      })
    );
  hubCmd
    .command("anchor-export")
    .description("Compute and save signed Merkle anchor for receipt digests on date")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--date <YYYY-MM-DD>", "Anchor date")
    .option("--json", "JSON output")
    .action((opts) =>
      runHubAnchorExport({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        date: opts.date,
        json: opts.json,
      })
    );
  hubCmd
    .command("anchor-verify")
    .description("Verify signed Merkle anchor (local or remote)")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory")
    .option("--hub-url <url>", "Remote hub base URL")
    .option("--date <YYYY-MM-DD>", "Anchor date")
    .option("--public-key <b64>", "Override hub public key")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runHubAnchorVerify({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        hubUrl: opts.hubUrl,
        date: opts.date,
        hubPublicKey: opts.publicKey,
        json: opts.json,
      })
    );
  hubCmd
    .command("gossip-export")
    .description("Export gossip snapshot of hub receipts (audit read-only)")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--since <iso>", "Filter receipts since ISO timestamp")
    .option("--json", "JSON output")
    .action((opts) =>
      runHubGossipExport({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        since: opts.since,
        json: opts.json,
      })
    );
  hubCmd
    .command("gossip-attestation-export")
    .description("Export attestations for gossip sync")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--since <iso>", "Filter since ISO timestamp")
    .option("--json", "JSON output")
    .action((opts) =>
      runHubGossipAttestationExport({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        since: opts.since,
        json: opts.json,
      })
    );

  hubCmd.description(
    "Compatibility alias for historical Witness Hub CLI; canonical client operations use `orgos wire witness`"
  );
}
