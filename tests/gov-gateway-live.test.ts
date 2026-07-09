import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import { operatorAttestationSchema } from "../schemas/protocol/operator-attestation.js";
import {
  deliverEnvelopeViaGovGateway,
  setDefaultGovGatewayTransport,
  resetDefaultGovGatewayTransport,
  MockGovGatewayTransport,
} from "../src/lib/wire/gov-gateway/deliver.js";

function cleanup(): void {
  const protocolDir = join(getDataDir(), "protocol");
  if (existsSync(protocolDir)) rmSync(protocolDir, { recursive: true, force: true });
}

function writeGovConfig(): void {
  writeFileSync(
    join(getDataDir(), "protocol", "gov-gateway.yaml"),
    `enabled: true
default_profile: xroad_v7
profiles:
  - profile_id: xroad_v7
    enabled: true
    adapter_ref: steward/jurisdiction-packs/EE/protocol/xroad-adapter.profile.yaml
    member_code: EE/DEV/OPENORGOS
    subsystem_code: wire
    service_code: EE/COM/PARTNER/wire/notice-deliver
    security_server_url: https://ss-sandbox.example.ee
`,
    "utf-8"
  );
}

describe("gov-gateway live deliver (mock transport Phase 4)", () => {
  beforeEach(() => {
    setTenantId("mal");
    cleanup();
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    mkdirSync(join(getDataDir(), "contracts"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-099.yaml"),
      `id: CTR-099
name: Test
counterparty: Gov Partner
type: rental
status: executed
start_date: "2026-01-01"
executed_date: "2026-01-15"
monthly_cost: 50000
`,
      "utf-8"
    );
    ensureProtocolSigningKey();
    writeGovConfig();
    process.env.GOV_GATEWAY_TRANSPORT = "mock";
    setDefaultGovGatewayTransport(new MockGovGatewayTransport({ defaultOk: true, defaultStatus: 202 }));
    registerPeer({
      peer_id: "PEER-080",
      display_name: "Gov Sandbox Peer",
      jurisdiction: "EE",
      inbound_endpoints: [
        {
          url: "https://ss-sandbox.example.ee/r1/EE/COM/PARTNER/wire/notice-deliver",
          mode: "push",
          transport: "gov_gateway",
          gov_gateway: {
            profile_id: "xroad_v7",
            service_code: "EE/COM/PARTNER/wire/notice-deliver",
            member_code: "EE/COM/PARTNER",
            subsystem_code: "wire",
          },
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
    delete process.env.GOV_GATEWAY_TRANSPORT;
    resetDefaultGovGatewayTransport();
  });

  it("delivers envelope via gov_gateway transport with HTTP 2xx", async () => {
    const attestation = operatorAttestationSchema.parse({
      operator_id: "op",
      approver_id: "ceo",
      approval_tier: "A",
      approved_at: new Date().toISOString(),
      basis: "existing_contract",
      notice_id: "NOTICE-GOV",
      approval_policy_ref: "REG-004",
    });
    const { envelope } = recordProtocolTransaction({
      transactionType: "contract.execution.notice",
      peerId: "PEER-080",
      contractId: "CTR-099",
      operatorAttestation: attestation,
    });

    const { loadPeersRegistry } = await import("../src/lib/protocol/peers.js");
    const endpoint = loadPeersRegistry().peers[0]!.inbound_endpoints![0]!;

    const result = await deliverEnvelopeViaGovGateway({
      envelope,
      peerId: "PEER-080",
      endpoint,
      tenantId: "mal",
    });

    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(202);
    expect(result.endpoint).toContain("ss-sandbox.example.ee");
  });
});
