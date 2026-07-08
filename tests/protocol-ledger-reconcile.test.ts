import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getDataDir } from "../src/lib/utils.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { recordProtocolTransaction } from "../src/lib/protocol/record-transaction.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { startProtocolApiServer } from "../src/lib/protocol/protocol-api-server.js";
import { buildProtocolApiServerConfig } from "../src/lib/protocol/protocol-api-config.js";
import {
  comparePeerLedgers,
  reconcileRemotePeerLedger,
} from "../src/lib/protocol/witness-reconcile.js";
import { operatorAttestationSchema } from "../schemas/protocol/operator-attestation.js";

function cleanup(): void {
  const p = join(getDataDir(), "protocol");
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

describe("protocol ledger reconcile", () => {
  let closeServer: (() => void) | undefined;
  let ledgerUrl: string;

  beforeEach(async () => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "contracts"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-099.yaml"),
      `id: CTR-099
name: Test
counterparty: Peer
type: rental
status: executed
start_date: "2026-01-01"
monthly_cost: 50000
`,
      "utf-8"
    );
    ensureProtocolSigningKey();
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Peer",
      jurisdiction: "JP",
    });

    const server = await startProtocolApiServer({
      config: buildProtocolApiServerConfig({ port: 0 }),
    });
    closeServer = server.close;
    ledgerUrl = `${server.url}/protocol/v1/ledger`;

    registerPeer({
      peer_id: "PEER-001",
      display_name: "Peer",
      jurisdiction: "JP",
      ledger_api_url: ledgerUrl,
    });
  });

  afterEach(() => {
    closeServer?.();
    cleanup();
  });

  it("reports no ledger drift when local matches protocol API ledger", async () => {
    const attestation = operatorAttestationSchema.parse({
      operator_id: "op",
      approver_id: "ceo",
      approval_tier: "A",
      approved_at: new Date().toISOString(),
      basis: "existing_contract",
      notice_id: "NOTICE-1",
      approval_policy_ref: "REG-004",
    });
    recordProtocolTransaction({
      transactionType: "contract.execution.notice",
      peerId: "PEER-001",
      contractId: "CTR-099",
      operatorAttestation: attestation,
    });

    const result = await reconcileRemotePeerLedger({ peerId: "PEER-001" });
    expect(result.checked).toBe(1);
    expect(result.alerts.filter((a) => a.code.startsWith("ledger-"))).toHaveLength(0);
  });

  it("comparePeerLedgers flags drift both ways", () => {
    const alerts = comparePeerLedgers(
      ["local-only"],
      [{ event_id: "remote-only", transaction_id: "TX-1" }]
    );
    expect(alerts.some((a) => a.code === "ledger-remote-missing")).toBe(true);
    expect(alerts.some((a) => a.code === "ledger-local-missing")).toBe(true);
  });
});
