import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir, writeYamlFile } from "../src/lib/utils.js";
import {
  getTransactionsRegistryPath,
  getWitnessPoolYamlPath,
} from "../src/lib/protocol/paths.js";
import { transactionsRegistrySchema } from "../schemas/protocol/transaction-record.js";
import { witnessPoolConfigSchema } from "../schemas/protocol/witness-pool.js";
import {
  evaluateTransactionOrphans,
  pruneOrphanTransactions,
} from "../src/lib/protocol/transaction-orphans.js";
import { loadTransactionsRegistry } from "../src/lib/protocol/transactions.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import * as witnessClient from "../src/lib/protocol/witness-client.js";
import type { EventEnvelope } from "../schemas/protocol/org-event.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

function seedOutboundTx(eventId: string, txId: string): void {
  writeYamlFile(
    getTransactionsRegistryPath(),
    transactionsRegistrySchema.parse({
      transactions: [
        {
          transaction_id: txId,
          event_id: eventId,
          direction: "outbound",
          transaction_type: "contract.execution.notice",
          our_org: { org_id: "demo", org_uri: "steward://tenant/demo" },
          counterparty: { org_id: "PEER-001", org_uri: "steward://tenant/peer" },
          refs: { contract_id: "CTR-001" },
          recorded_at: "2026-07-10T00:00:00.000Z",
        },
      ],
    })
  );
}

describe("protocol transaction orphans", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    ensureProtocolSigningKey();
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
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
    writeFileSync(join(getDataDir(), "protocol", "audit-chain.jsonl"), "", "utf-8");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("marks outbound tx as orphan when envelope and receipts are missing", async () => {
    seedOutboundTx("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "TX-20260710-001");
    const candidates = await evaluateTransactionOrphans();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.orphan).toBe(true);
    expect(candidates[0]?.reasons).toEqual(
      expect.arrayContaining(["envelope-missing", "witness-receipt-missing"])
    );
  });

  it("does not mark orphan when envelope exists", async () => {
    seedOutboundTx("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "TX-20260710-002");
    vi.spyOn(witnessClient, "findEnvelopeFileForWitness").mockReturnValue({
      event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    } as EventEnvelope);

    const candidates = await evaluateTransactionOrphans();
    expect(candidates[0]?.orphan).toBe(false);
    expect(candidates[0]?.reasons).not.toContain("envelope-missing");
  });

  it("dry-run prune lists orphans without mutating registry", async () => {
    seedOutboundTx("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "TX-20260710-003");
    const result = await pruneOrphanTransactions();
    expect(result.dry_run).toBe(true);
    expect(result.orphans).toHaveLength(1);
    expect(result.removed).toHaveLength(0);
    expect(loadTransactionsRegistry().transactions).toHaveLength(1);
  });

  it("apply prune removes orphan rows from registry", async () => {
    seedOutboundTx("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "TX-20260710-004");
    const result = await pruneOrphanTransactions({ apply: true });
    expect(result.dry_run).toBe(false);
    expect(result.removed).toHaveLength(1);
    expect(loadTransactionsRegistry().transactions).toHaveLength(0);
  });
});
