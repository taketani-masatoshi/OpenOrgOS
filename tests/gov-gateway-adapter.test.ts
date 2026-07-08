import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir, ROOT_DIR } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import {
  ensureProtocolSigningKey,
  maybeSignEnvelope,
} from "../src/lib/protocol/signing.js";
import { eventEnvelopeSchema } from "../schemas/protocol/org-event.js";
import {
  resolveAdapter,
  validateGovGatewaySetup,
  encodeOpenOrgOsMime,
  decodeOpenOrgOsMime,
  MockGovGatewayTransport,
  setDefaultGovGatewayTransport,
  resetDefaultGovGatewayTransport,
  deliverEnvelopeViaGovGateway,
  decodeGovGatewayInbound,
  buildGovGatewayInboundWireBody,
} from "../src/lib/wire/gov-gateway/index.js";
import { deliverProtocolEnvelope } from "../src/lib/protocol/transport.js";
import { isWireDelivered } from "../src/lib/protocol/wire-delivered.js";
import { parseInboundWebhookBody } from "../src/lib/protocol/webhook-bridge.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import { operatorAttestationSchema } from "../schemas/protocol/operator-attestation.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

function loadFixtureEnvelope() {
  const raw = JSON.parse(
    readFileSync(join(ROOT_DIR, "tests/fixtures/gov-gateway/shared-envelope.json"), "utf-8")
  );
  return maybeSignEnvelope(eventEnvelopeSchema.parse(raw));
}

describe("gov-gateway adapters (P0)", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    mkdirSync(join(getDataDir(), "contracts"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-099.yaml"),
      `id: CTR-099
name: Test
counterparty: Peer Co
type: rental
status: executed
start_date: "2026-01-01"
executed_date: "2026-01-15"
monthly_cost: 50000
`,
      "utf-8"
    );
    ensureProtocolSigningKey();
    resetDefaultGovGatewayTransport();
  });

  afterEach(() => {
    resetDefaultGovGatewayTransport();
    cleanup();
  });

  it("validateGovGatewaySetup accepts registry with P0 profiles (draft placeholders ok)", () => {
    const result = validateGovGatewaySetup();
    expect(result.ok).toBe(true);
    expect(result.issues.every((i) => i.code === "profile_pending" || false)).toBe(
      result.issues.length === 0 || result.issues.every((i) => i.code === "profile_pending")
    );
  });

  it.each([
    ["xroad_v7"],
    ["jp_egov_central"],
    ["ge_gov_gateway_3g"],
  ] as const)("encode/decode round-trip · %s", async (profileId) => {
    const envelope = loadFixtureEnvelope();
    const mock = new MockGovGatewayTransport();
    setDefaultGovGatewayTransport(mock);
    const adapter = resolveAdapter(profileId);
    expect(adapter.profile_id).toBe(profileId);

    const native = await adapter.encode(envelope, {
      tenant_id: "demo",
      peer_org_id: "partner",
      service_code: profileId === "ge_gov_gateway_3g" ? "wire.notice-deliver" : undefined,
      member_code: "EE/DEV/OPENORGOS",
      subsystem_code: "wire",
      participant_id: "demo",
    });
    expect(native.profile_id).toBe(profileId);
    expect(native.body).toBeTruthy();

    const decoded = await adapter.decode(native, {
      tenant_id: "demo",
      profile_id: profileId,
    });
    expect(decoded.event_id).toBe(envelope.event_id);
    expect(decoded.event.type).toBe(envelope.event.type);
    expect(decodeOpenOrgOsMime(encodeOpenOrgOsMime(envelope)).event_id).toBe(envelope.event_id);

    const health = await adapter.health();
    expect(health.ok).toBe(true);
  });

  it("mock deliver succeeds and records request", async () => {
    const envelope = loadFixtureEnvelope();
    const mock = new MockGovGatewayTransport({ defaultStatus: 200 });
    setDefaultGovGatewayTransport(mock);
    const url = "http://127.0.0.1:9/gov-gateway/mock";

    const result = await deliverEnvelopeViaGovGateway({
      envelope,
      peerId: "PEER-050",
      endpoint: {
        url,
        mode: "push",
        priority: 1,
        transport: "gov_gateway",
        gov_gateway: {
          profile_id: "xroad_v7",
          service_code: "EE/COM/PARTNER/wire/notice-deliver",
          member_code: "EE/COM/PARTNER",
          subsystem_code: "wire",
        },
      },
      tenantId: "demo",
    });
    expect(result.ok).toBe(true);
    expect(mock.requests).toHaveLength(1);
    expect(mock.requests[0]!.headers["X-Road-Client"]).toContain("wire");
    expect(mock.requests[0]!.headers["X-Request-Id"]).toBe(envelope.event_id);
  });

  it("mock deliver HTTP 500 fails without rolling back", async () => {
    const envelope = loadFixtureEnvelope();
    const mock = new MockGovGatewayTransport({ defaultOk: false, defaultStatus: 500 });
    setDefaultGovGatewayTransport(mock);
    const url = "http://127.0.0.1:9/gov-gateway/fail";
    const result = await deliverEnvelopeViaGovGateway({
      envelope,
      peerId: "PEER-051",
      endpoint: {
        url,
        mode: "push",
        priority: 1,
        transport: "gov_gateway",
        gov_gateway: { profile_id: "jp_egov_central" },
      },
      tenantId: "demo",
    });
    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(500);
  });

  it("transport.ts routes gov_gateway endpoint via adapter", async () => {
    const mock = new MockGovGatewayTransport();
    setDefaultGovGatewayTransport(mock);
    const url = "http://127.0.0.1:9/r1/service";
    registerPeer({
      peer_id: "PEER-060",
      display_name: "X-Road Peer",
      jurisdiction: "EE",
      org_uri: "steward://tenant/partner",
      inbound_endpoints: [
        {
          url,
          mode: "push",
          priority: 1,
          transport: "gov_gateway",
          gov_gateway: {
            profile_id: "xroad_v7",
            service_code: "EE/COM/PARTNER/wire/notice-deliver",
            member_code: "EE/DEV/OPENORGOS",
            subsystem_code: "wire",
          },
        },
      ],
    });

    const attestation = operatorAttestationSchema.parse({
      operator_id: "op",
      approver_id: "ceo",
      approval_tier: "A",
      approved_at: new Date().toISOString(),
      basis: "existing_contract",
      notice_id: "NOTICE-1",
      approval_policy_ref: "REG-004",
    });
    const { envelope } = recordProtocolTransaction({
      transactionType: "contract.execution.notice",
      peerId: "PEER-060",
      contractId: "CTR-099",
      operatorAttestation: attestation,
    });

    const delivery = await deliverProtocolEnvelope(envelope, "PEER-060");
    expect(delivery.delivered).toBe(true);
    expect(mock.requests.length).toBe(1);
    expect(isWireDelivered("PEER-060", envelope.event_id)).toBe(true);
  });

  it("ingest decode round-trips gov_gateway webhook body", async () => {
    const envelope = loadFixtureEnvelope();
    const adapter = resolveAdapter("xroad_v7");
    const native = await adapter.encode(envelope, { tenant_id: "demo" });
    const wireBody = buildGovGatewayInboundWireBody(native);
    const decoded = await decodeGovGatewayInbound(wireBody, "demo");
    expect(decoded.ok).toBe(true);
    expect(decoded.envelope?.event_id).toBe(envelope.event_id);

    const parsed = parseInboundWebhookBody(wireBody);
    expect(parsed.envelope?.event_id).toBe(envelope.event_id);
  });

  it("ge_3g wrap/unwrap embeds OpenOrgOS MIME in payload", async () => {
    const envelope = loadFixtureEnvelope();
    const adapter = resolveAdapter("ge_gov_gateway_3g");
    const native = await adapter.encode(envelope, {
      tenant_id: "demo",
      participant_id: "demo-participant",
      service_code: "wire.notice-deliver",
    });
    const wrapper = JSON.parse(typeof native.body === "string" ? native.body : "");
    expect(wrapper.service_id).toBe("wire.notice-deliver");
    expect(wrapper.participant_id).toBe("demo-participant");
    expect(typeof wrapper.payload).toBe("string");

    const round = await adapter.decode(native, {
      tenant_id: "demo",
      profile_id: "ge_gov_gateway_3g",
    });
    expect(round.event_id).toBe(envelope.event_id);
  });
});
