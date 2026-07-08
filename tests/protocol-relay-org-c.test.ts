import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { setTenantId, getDataDir, getDocsDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { ensureProtocolSigningKey, maybeSignEnvelope } from "../src/lib/protocol/signing.js";
import { startProtocolApiServer } from "../src/lib/protocol/protocol-api-server.js";
import { buildProtocolApiServerConfig } from "../src/lib/protocol/protocol-api-config.js";
import {
  deliverViaRelayStore,
  flushWireRelayInbox,
} from "../src/lib/protocol/transport.js";
import { eventEnvelopeSchema } from "../schemas/protocol/org-event.js";
import { operatorAttestationSchema } from "../schemas/protocol/operator-attestation.js";
import { getProtocolRelayStoreDir } from "../src/lib/protocol/paths.js";
import {
  ensureProposal3Pki,
  writePartyProtocolClientConfig,
} from "../src/lib/protocol/tls-pki.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("Org C relay enqueue + receiver pull", () => {
  let orgCApi: { url: string; close: () => void } | undefined;
  let orgCApiClose: (() => void) | undefined;
  const ORG_C = "aiac";
  const SENDER = "mal";
  const RECEIVER = "southwood";

  beforeEach(() => {
    setTenantId(ORG_C);
    for (const t of [ORG_C, SENDER, RECEIVER]) {
      setTenantId(t);
      cleanup();
    }
    setTenantId(ORG_C);
    ensureProtocolSigningKey();
    mkdirSync(getProtocolRelayStoreDir(), { recursive: true });
  });

  afterEach(async () => {
    orgCApiClose?.();
    orgCApi = undefined;
    setTenantId("demo");
  });

  it("stores envelope on Org C and receiver pulls into inbox", async () => {
    orgCApi = await startProtocolApiServer({ host: "127.0.0.1", port: 0, tenantId: ORG_C });
    orgCApiClose = orgCApi.close;

    const eventId = randomUUID();
    const attestation = operatorAttestationSchema.parse({
      operator_id: "op",
      approver_id: "ceo",
      approval_tier: "A",
      approved_at: new Date().toISOString(),
      basis: "existing_contract",
      notice_id: "NOTICE-RELAY-1",
      approval_policy_ref: "REG-004",
    });
    const envelope = maybeSignEnvelope(
      eventEnvelopeSchema.parse({
        protocol_version: "1",
        event_id: eventId,
        occurred_at: new Date().toISOString(),
        origin: { org_id: "mal", org_uri: "steward://tenant/mal" },
        destination: { org_id: "PEER-001", org_uri: "steward://tenant/southwood" },
        identity: { org_ref: { org_id: "mal", org_uri: "steward://tenant/mal" } },
        event: {
          type: "org.transaction.recorded",
          payload: {
            transaction_id: "TX-RELAY-1",
            direction: "outbound",
            transaction_type: "steward.contract.execution.notice",
            refs: { contract_id: "CTR-012" },
            operator_attestation: attestation,
          },
        },
      })
    );

    setTenantId(SENDER);
    ensureProtocolSigningKey();
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Southwood",
      jurisdiction: "JP",
      org_uri: "steward://tenant/southwood",
      inbound_endpoints: [
        { url: `${orgCApi.url}/protocol/v1/relay/enqueue`, priority: 1, mode: "relay" },
      ],
    });

    const sent = await deliverViaRelayStore(
      envelope,
      "PEER-001",
      `${orgCApi.url}/protocol/v1/relay/enqueue`
    );
    expect(sent.delivered).toBe(true);
    expect(sent.relayed).toBe(true);

    setTenantId(RECEIVER);
    ensureProtocolSigningKey();
    registerPeer({
      peer_id: "PEER-002",
      display_name: "MAL",
      jurisdiction: "JP",
      org_uri: "steward://tenant/mal",
    });
    mkdirSync(join(getDataDir(), "contracts"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-012.yaml"),
      `id: CTR-012
name: Test
counterparty: Peer
type: rental
status: executed
start_date: "2026-01-01"
executed_date: "2026-01-15"
monthly_cost: 50000
protocol:
  witness_trust_bundle_url: ${orgCApi.url}/protocol/v1/trust/bundle
`,
      "utf-8"
    );

    const pulled = await flushWireRelayInbox(orgCApi.url);
    expect(pulled).toBe(1);
    expect(existsSync(join(getDocsDir(), "protocol", "inbox", `${eventId}.json`))).toBe(true);
  });

  it("pulls via HTTPS + mTLS when client config is present", async () => {
    const pkiDir = mkdtempSync(join(tmpdir(), "steward-p3-pki-"));
    const pki = ensureProposal3Pki({ clients: [SENDER, RECEIVER], outputDir: pkiDir, force: true });
    const allowedOrgUris = Object.values(pki.clientCerts).map((c) => c.orgUri);

    setTenantId(SENDER);
    writePartyProtocolClientConfig(SENDER, pki);
    setTenantId(RECEIVER);
    writePartyProtocolClientConfig(RECEIVER, pki);

    orgCApi = await startProtocolApiServer({
      config: buildProtocolApiServerConfig({
        host: "127.0.0.1",
        port: 0,
        tlsCert: pki.serverCertPath,
        tlsKey: pki.serverKeyPath,
        tlsCa: pki.caCertPath,
        mtlsRequired: true,
        mtlsAllowedOrgUris: allowedOrgUris,
      }),
      tenantId: ORG_C,
    });
    orgCApiClose = orgCApi.close;

    const eventId = randomUUID();
    const envelope = maybeSignEnvelope(
      eventEnvelopeSchema.parse({
        protocol_version: "1",
        event_id: eventId,
        occurred_at: new Date().toISOString(),
        origin: { org_id: "mal", org_uri: "steward://tenant/mal" },
        destination: { org_id: "PEER-001", org_uri: "steward://tenant/southwood" },
        identity: { org_ref: { org_id: "mal", org_uri: "steward://tenant/mal" } },
        event: {
          type: "org.transaction.recorded",
          payload: {
            transaction_id: "TX-RELAY-MTLS",
            direction: "outbound",
            transaction_type: "steward.contract.execution.notice",
            refs: { contract_id: "CTR-012" },
            operator_attestation: operatorAttestationSchema.parse({
              operator_id: "op",
              approver_id: "ceo",
              approval_tier: "A",
              approved_at: new Date().toISOString(),
              basis: "existing_contract",
              notice_id: "NOTICE-MTLS",
              approval_policy_ref: "REG-004",
            }),
          },
        },
      })
    );

    setTenantId(SENDER);
    ensureProtocolSigningKey();
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Southwood",
      jurisdiction: "JP",
      org_uri: "steward://tenant/southwood",
      inbound_endpoints: [
        { url: `${orgCApi.url}/protocol/v1/relay/enqueue`, priority: 1, mode: "relay" },
      ],
    });

    const sent = await deliverViaRelayStore(
      envelope,
      "PEER-001",
      `${orgCApi.url}/protocol/v1/relay/enqueue`
    );
    expect(sent.delivered).toBe(true);

    setTenantId(RECEIVER);
    ensureProtocolSigningKey();
    registerPeer({
      peer_id: "PEER-002",
      display_name: "MAL",
      jurisdiction: "JP",
      org_uri: "steward://tenant/mal",
    });
    mkdirSync(join(getDataDir(), "contracts"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-012.yaml"),
      `id: CTR-012
name: Test
counterparty: Peer
type: rental
status: executed
start_date: "2026-01-01"
executed_date: "2026-01-15"
monthly_cost: 50000
protocol:
  witness_trust_bundle_url: ${orgCApi.url}/protocol/v1/trust/bundle
`,
      "utf-8"
    );

    const pulled = await flushWireRelayInbox(orgCApi.url);
    expect(pulled).toBe(1);
    rmSync(pkiDir, { recursive: true, force: true });
  });
});
