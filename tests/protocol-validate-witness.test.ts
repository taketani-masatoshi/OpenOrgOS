import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir, writeYamlFile } from "../src/lib/utils.js";
import { validateProtocolState } from "../src/lib/protocol/validate.js";
import { getWitnessPoolYamlPath, getTransactionsRegistryPath } from "../src/lib/protocol/paths.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { witnessPoolConfigSchema } from "../schemas/protocol/witness-pool.js";
import { transactionsRegistrySchema } from "../schemas/protocol/transaction-record.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("protocol validate witness warnings", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    ensureProtocolSigningKey();
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    registerPeer({ peer_id: "PEER-001", display_name: "Peer", jurisdiction: "JP" });
    writeYamlFile(
      getWitnessPoolYamlPath(),
      witnessPoolConfigSchema.parse({
        enabled: true,
        quorum: { mode: "any_of_n" },
        register_on: "both",
        hubs: [
          {
            hub_id: "HUB-A",
            hub_url: "http://127.0.0.1:9474",
            hub_public_key: "dummy",
            priority: 1,
          },
        ],
      })
    );
    writeYamlFile(
      getTransactionsRegistryPath(),
      transactionsRegistrySchema.parse({
        transactions: [
          {
            transaction_id: "TX-20260626-001",
            event_id: "11111111-1111-4111-8111-111111111111",
            direction: "outbound",
            transaction_type: "contract.execution.notice",
            our_org: { org_id: "demo", org_uri: "steward://tenant/demo" },
            counterparty: { org_id: "PEER-001", org_uri: "steward://tenant/peer" },
            refs: { contract_id: "CTR-001" },
            recorded_at: new Date().toISOString(),
          },
        ],
      })
    );
    writeFileSync(join(getDataDir(), "protocol", "audit-chain.jsonl"), "", "utf-8");
  });

  afterEach(() => cleanup());

  it("warns when witness receipts missing for outbound tx", () => {
    const result = validateProtocolState();
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.code === "witness-receipt-missing")).toBe(true);
  });
});
