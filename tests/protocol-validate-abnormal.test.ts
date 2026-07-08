import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir, writeYamlFile } from "../src/lib/utils.js";
import { validateProtocolState } from "../src/lib/protocol/validate.js";
import {
  getProtocolAuditChainPath,
  getPeersYamlPath,
  getTransactionsRegistryPath,
  getWitnessPoolYamlPath,
} from "../src/lib/protocol/paths.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import {
  appendProtocolAuditRecord,
  verifyProtocolAuditChain,
} from "../src/lib/protocol/audit-chain.js";
import { buildIdentityDocument, buildIdentityEnvelope } from "../src/lib/protocol/identity.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { witnessPoolConfigSchema } from "../schemas/protocol/witness-pool.js";
import { transactionsRegistrySchema } from "../schemas/protocol/transaction-record.js";
import { PROTOCOL_REGISTRY_PATH } from "../src/lib/protocol/registry.js";
import { validateProtocolFile } from "../src/lib/protocol/validate.js";

const PLATFORM_REGISTRY_BACKUP = join(tmpdir(), "steward-protocol-registry-backup.yaml");

function backupPlatformRegistry(): void {
  if (existsSync(PROTOCOL_REGISTRY_PATH)) {
    copyFileSync(PROTOCOL_REGISTRY_PATH, PLATFORM_REGISTRY_BACKUP);
  }
}

function restorePlatformRegistry(): void {
  if (existsSync(PLATFORM_REGISTRY_BACKUP)) {
    copyFileSync(PLATFORM_REGISTRY_BACKUP, PROTOCOL_REGISTRY_PATH);
    unlinkSync(PLATFORM_REGISTRY_BACKUP);
  }
}

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

function seedWitnessEnabled(): void {
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
}

describe("protocol validate abnormal (P1 fixtures)", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    ensureProtocolSigningKey();
    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
  });

  afterEach(() => {
    cleanup();
    restorePlatformRegistry();
  });

  it("reports registry-invalid when platform registry.yaml fails schema", () => {
    backupPlatformRegistry();
    writeFileSync(
      PROTOCOL_REGISTRY_PATH,
      "protocol_version: '2'\ncore_event_types: []\n",
      "utf-8"
    );
    const result = validateProtocolState({ standalone: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "registry-invalid")).toBe(true);
  });

  it("rejects invalid envelope JSON via validateProtocolFile", () => {
    const tmp = join(tmpdir(), `steward-invalid-envelope-${Date.now()}.json`);
    writeFileSync(tmp, JSON.stringify({ not: "an envelope" }), "utf-8");
    const result = validateProtocolFile(tmp, "envelope");
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("fails standalone when witness pool is enabled", () => {
    seedWitnessEnabled();
    const result = validateProtocolState({ standalone: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "standalone-witness-enabled")).toBe(true);
  });

  it("reports duplicate event_id in transactions registry", () => {
    const eventId = "22222222-2222-4222-8222-222222222222";
    writeYamlFile(
      getTransactionsRegistryPath(),
      transactionsRegistrySchema.parse({
        transactions: [
          {
            transaction_id: "TX-20260626-001",
            event_id: eventId,
            direction: "outbound",
            transaction_type: "contract.execution.notice",
            our_org: { org_id: "demo", org_uri: "steward://tenant/demo" },
            counterparty: { org_id: "PEER-001", org_uri: "steward://tenant/peer" },
            refs: { contract_id: "CTR-001" },
            recorded_at: new Date().toISOString(),
          },
          {
            transaction_id: "TX-20260626-002",
            event_id: eventId,
            direction: "inbound",
            transaction_type: "obligation.acknowledged",
            our_org: { org_id: "demo", org_uri: "steward://tenant/demo" },
            counterparty: { org_id: "PEER-001", org_uri: "steward://tenant/peer" },
            refs: {},
            recorded_at: new Date().toISOString(),
          },
        ],
      })
    );
    const result = validateProtocolState({ standalone: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "transaction-duplicate-event")).toBe(true);
  });

  it("reports peers-invalid for malformed peers.yaml", () => {
    writeFileSync(getPeersYamlPath(), "peers:\n  - peer_id: NOT-A-PEER\n", "utf-8");
    const result = validateProtocolState({ standalone: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "peers-invalid")).toBe(true);
  });

  it("reports transactions-invalid for malformed transactions-registry.yaml", () => {
    writeFileSync(getTransactionsRegistryPath(), "transactions:\n  - bad: true\n", "utf-8");
    const result = validateProtocolState({ standalone: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "transactions-invalid")).toBe(true);
  });

  it("reports peer-stakeholder-orphan when peer references unknown stakeholder", () => {
    registerPeer({
      peer_id: "PEER-001",
      display_name: "Peer",
      jurisdiction: "JP",
      stakeholder_id: "STK-UNKNOWN",
    });
    writeYamlFile(join(getDataDir(), "executive", "stakeholders.yaml"), {
      stakeholders: [{ id: "STK-001", name: "Known", role: "director" }],
    });
    const result = validateProtocolState();
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "peer-stakeholder-orphan")).toBe(true);
  });

  it("fails validate when audit chain prev_audit_id is tampered", () => {
    const doc = buildIdentityDocument();
    const env1 = buildIdentityEnvelope(doc);
    const env2 = buildIdentityEnvelope(doc);
    appendProtocolAuditRecord({ envelope: env1 });
    appendProtocolAuditRecord({ envelope: env2 });

    const chainPath = getProtocolAuditChainPath();
    const lines = readFileSync(chainPath, "utf-8").trim().split("\n");
    const tampered = JSON.parse(lines[1]!) as Record<string, unknown>;
    tampered.prev_audit_id = "PAUD-tampered";
    lines[1] = JSON.stringify(tampered);
    writeFileSync(chainPath, `${lines.join("\n")}\n`, "utf-8");

    const direct = verifyProtocolAuditChain();
    expect(direct.ok).toBe(false);
    expect(direct.issues.some((i) => i.message.includes("prev_audit_id mismatch"))).toBe(true);

    const result = validateProtocolState({ standalone: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "audit-chain")).toBe(true);
  });

  it("fails verify when audit chain digest does not match envelope", () => {
    const doc = buildIdentityDocument();
    const env = buildIdentityEnvelope(doc);
    appendProtocolAuditRecord({ envelope: env });

    const chainPath = getProtocolAuditChainPath();
    const record = JSON.parse(readFileSync(chainPath, "utf-8").trim()) as Record<string, unknown>;
    record.digest = "0".repeat(64);
    writeFileSync(chainPath, `${JSON.stringify(record)}\n`, "utf-8");

    const verify = verifyProtocolAuditChain({
      envelopesByEventId: new Map([[env.event_id, env]]),
    });
    expect(verify.ok).toBe(false);
    expect(verify.issues.some((i) => i.message.includes("digest mismatch"))).toBe(true);
  });
});
