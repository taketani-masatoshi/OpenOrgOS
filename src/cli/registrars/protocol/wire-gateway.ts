import type { Command } from "commander";
import {
  runWireGatewayServe,
  runWireGatewayValidate,
  runWireGatewayTlsInit,
  runWireGatewayDidShow,
  runWireGatewayDidInit,
  runWireGatewayInit,
  runWireGatewayDiscover,
  runWireGatewayFederationList,
  runWireGatewayDiscoverApply,
  runWireGatewayFederationSync,
  runWireGatewayDnsResolve,
  runWireGatewayDnsHints,
  runWireGatewayFederationGossip,
  runWireGatewayScore,
  runWireInternalApiServe,
} from "../../../commands/wire-gateway.js";

/** Historical `orgos wire-gateway` root — prefer `orgos wire gateway`. */
export function registerLegacyWireGatewayCommands(program: Command): void {
  const wireGatewayCmd = program
    .command("wire-gateway")
    .description("Compatibility alias for `orgos wire gateway` (deprecated root)");
  wireGatewayCmd
    .command("serve")
    .description("Start Wire Gateway HTTP/HTTPS server")
    .option("--tenant <id>", "Tenant id")
    .option("--host <host>", "Override listen host")
    .option("--port <n>", "Override listen port")
    .option("--public-base-url <url>", "Public URL for well-known (behind reverse proxy)")
    .option("--tls-cert <path>", "TLS certificate PEM (HTTPS)")
    .option("--tls-key <path>", "TLS private key PEM")
    .option("--no-outbound", "Disable outbox polling worker")
    .action(async (opts) =>
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
  wireGatewayCmd
    .command("init")
    .description("Initialize wire-gateway.yaml from trust registry (tenant pilot)")
    .option("--tenant <id>", "Tenant id")
    .option("--force", "Overwrite existing config")
    .option("--json", "JSON output")
    .action((opts) =>
      runWireGatewayInit({ tenant: opts.tenant, force: opts.force, json: opts.json })
    );
  wireGatewayCmd
    .command("tls-init")
    .description("Generate dev TLS certs and patch tenant wire-gateway.yaml")
    .option("--tenant <id>", "Tenant id")
    .option("--output-dir <path>", "TLS output directory")
    .option("--force", "Regenerate existing material")
    .option("--json", "JSON output")
    .action((opts) =>
      runWireGatewayTlsInit({
        tenant: opts.tenant,
        outputDir: opts.outputDir,
        force: opts.force,
        json: opts.json,
      })
    );
  const wireGatewayDidCmd = wireGatewayCmd.command("did").description("OpenOrg DID (WG-4)");
  wireGatewayDidCmd
    .command("show")
    .description("Show derived/configured DID for tenant Wire node")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runWireGatewayDidShow({ tenant: opts.tenant, json: opts.json }));
  wireGatewayDidCmd
    .command("init")
    .description("Write did + trust_registry_url into wire-gateway.yaml")
    .option("--tenant <id>", "Tenant id")
    .option("--force", "Overwrite existing did")
    .option("--json", "JSON output")
    .action((opts) =>
      runWireGatewayDidInit({ tenant: opts.tenant, force: opts.force, json: opts.json })
    );
  wireGatewayCmd
    .command("validate")
    .description("Validate wire-gateway.yaml")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runWireGatewayValidate({ tenant: opts.tenant, json: opts.json }));
  wireGatewayCmd
    .command("discover")
    .description("List trust-registry Wire nodes and peer registration suggestions (WG v2)")
    .option("--tenant <id>", "Tenant id")
    .option("--jurisdiction <code>", "Filter by witness_jurisdiction")
    .option("--suggest", "Print suggested peer register commands for unregistered nodes")
    .option("--apply", "Register unregistered nodes into peers.yaml")
    .option("--dry-run", "With --apply: preview without writing peers.yaml")
    .option("--node-id <id>", "Limit --apply to node_id (repeatable)", (v: string, prev: string[]) => [...prev, v], [] as string[])
    .option("--json", "JSON output")
    .action((opts) => {
      if (opts.apply) {
        runWireGatewayDiscoverApply({
          tenant: opts.tenant,
          jurisdiction: opts.jurisdiction,
          dryRun: opts.dryRun,
          nodeId: opts.nodeId?.length ? opts.nodeId : undefined,
          json: opts.json,
        });
        return;
      }
      runWireGatewayDiscover({
        tenant: opts.tenant,
        jurisdiction: opts.jurisdiction,
        suggest: opts.suggest,
        json: opts.json,
      });
    });
  const wireGatewayFederationCmd = wireGatewayCmd
    .command("federation")
    .description("Wire Gateway federation catalog (trust-registry read model · WG v2)");
  wireGatewayFederationCmd
    .command("list")
    .description("List all Wire nodes in platform trust registry")
    .option("--json", "JSON output")
    .action((opts) => runWireGatewayFederationList({ json: opts.json }));
  wireGatewayFederationCmd
    .command("sync")
    .description("Sync protocol_public_key from remote well-known into trust registry")
    .option("--node-id <id>", "Limit to one registry node_id")
    .option("--dry-run", "Preview without writing registry")
    .option("--force", "Overwrite pinned keys")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runWireGatewayFederationSync({
        nodeId: opts.nodeId,
        dryRun: opts.dryRun,
        force: opts.force,
        json: opts.json,
      })
    );
  wireGatewayFederationCmd
    .command("gossip")
    .description("Pull federation catalog from registry wire_url peers (WG v2 gossip)")
    .option("--dry-run", "Preview merge only")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runWireGatewayFederationGossip({ dryRun: opts.dryRun, json: opts.json })
    );
  const wireGatewayDnsCmd = wireGatewayCmd
    .command("dns")
    .description("OpenOrg DNS wire URL resolution (SRV/TXT/well-known)");
  wireGatewayDnsCmd
    .command("resolve")
    .description("Resolve DNS-style node_id to wire base URL")
    .argument("<nodeId>", "DNS-style node_id e.g. org.example.co.jp")
    .option("--json", "JSON output")
    .action(async (nodeId: string, opts: { json?: boolean }) =>
      runWireGatewayDnsResolve({ nodeId, json: opts.json })
    );
  wireGatewayDnsCmd
    .command("hints")
    .description("Print DNS TXT/SRV hints for operator publish")
    .requiredOption("--wire-url <url>", "Public wire base URL")
    .option("--json", "JSON output")
    .action((opts: { wireUrl: string; json?: boolean }) =>
      runWireGatewayDnsHints({ wireUrl: opts.wireUrl, json: opts.json })
    );
  wireGatewayCmd
    .command("score")
    .description("Wire platform checklist, or runtime score with --strict")
    .option("--strict", "Run mapped Vitest suites and score their execution evidence")
    .option("--json", "JSON output")
    .action((opts: { strict?: boolean; json?: boolean }) =>
      runWireGatewayScore({ strict: opts.strict, json: opts.json })
    );
  const wireInternalApiCmd = wireGatewayCmd
    .command("internal-api")
    .description("Core-side Internal API (dev / WG-2 bridge)");
  wireInternalApiCmd
    .command("serve")
    .description("Start Internal API server on /internal/v1/wire")
    .option("--tenant <id>", "Tenant id")
    .option("--host <host>", "Bind host", "127.0.0.1")
    .option("--port <n>", "Bind port", "8080")
    .option("--bearer-token <token>", "Bearer token for gateway auth")
    .action(async (opts) =>
      runWireInternalApiServe({
        tenant: opts.tenant,
        host: opts.host,
        port: Number(opts.port),
        bearerToken: opts.bearerToken,
      })
    );
}
