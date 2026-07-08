import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getDataDir } from "../src/lib/utils.js";
import {
  assertTransactionPayloadAllowedForPeer,
  resolvePeerProtocolPolicy,
} from "../src/lib/protocol/peer-protocol-policy.js";

function cleanup(): void {
  const p = join(getDataDir(), "contracts");
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

describe("peer protocol policy", () => {
  beforeEach(() => {
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
protocol:
  peer_id: PEER-001
  allowed_transaction_types:
    - steward.contract.execution.notice
  allowed_payload_namespaces:
    - steward.contract
`,
      "utf-8"
    );
  });

  afterEach(() => cleanup());

  it("loads policy from contract protocol block", () => {
    const policy = resolvePeerProtocolPolicy("PEER-001");
    expect(policy?.contract_ids).toContain("CTR-099");
    expect(policy?.allowed_transaction_types).toContain("steward.contract.execution.notice");
  });

  it("rejects transaction types outside whitelist", () => {
    expect(() =>
      assertTransactionPayloadAllowedForPeer("PEER-001", "steward.payment.instructed")
    ).toThrow(/not allowed/);
  });

  it("allows whitelisted transaction types", () => {
    expect(() =>
      assertTransactionPayloadAllowedForPeer("PEER-001", "steward.contract.execution.notice")
    ).not.toThrow();
  });
});
