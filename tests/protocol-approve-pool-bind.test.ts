import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getDataDir, getDocsDir } from "../src/lib/utils.js";
import {
  initWitnessTrustAuthority,
  certifyWitnessHub,
  addCertificateToBundle,
  publishWitnessTrustBundle,
} from "../src/lib/protocol/witness-trust.js";
import { generateHubKeyPair } from "../src/lib/hub/signing.js";
import { startProtocolApiServer } from "../src/lib/protocol/protocol-api-server.js";
import { buildProtocolApiServerConfig } from "../src/lib/protocol/protocol-api-config.js";
import { maybeBindWitnessPoolFromContract } from "../src/lib/protocol/contract-witness-pool.js";
import { getWitnessPoolYamlPath } from "../src/lib/protocol/paths.js";
import { readYamlFile } from "../src/lib/utils.js";
import { witnessPoolConfigSchema } from "../schemas/protocol/witness-pool.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("approve witness pool auto-bind", () => {
  let closeServer: (() => void) | undefined;
  let bundleUrl: string;

  beforeEach(async () => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "contracts"), { recursive: true });

    initWitnessTrustAuthority({
      authorityId: "WTA-C-TEST",
      orgName: "Trust C",
      jurisdiction: "JP",
    });
    const { publicKey } = generateHubKeyPair();
    const cert = certifyWitnessHub({
      hubId: "HUB-C",
      hubUrl: "http://127.0.0.1:9474",
      hubPublicKey: publicKey,
    });
    addCertificateToBundle(cert);
    publishWitnessTrustBundle();

    const server = await startProtocolApiServer({
      config: buildProtocolApiServerConfig({ port: 0 }),
    });
    closeServer = server.close;
    bundleUrl = `${server.url}/protocol/v1/trust/bundle`;

    writeFileSync(
      join(getDataDir(), "contracts", "CTR-099.yaml"),
      `id: CTR-099
name: Test
counterparty: Peer
type: rental
status: executed
start_date: "2026-01-01"
monthly_cost: 85000
protocol:
  resilience_sla: silver
  witness_trust_bundle_url: ${bundleUrl}
  witness_hubs:
    - hub_id: HUB-C
`,
      "utf-8"
    );
  });

  afterEach(() => {
    closeServer?.();
    cleanup();
  });

  it("maybeBindWitnessPoolFromContract loads verified hubs from HTTPS bundle URL", async () => {
    const result = await maybeBindWitnessPoolFromContract("CTR-099");
    expect(result?.bound).toBe(true);
    expect(result?.hub_count).toBe(1);
    expect(existsSync(getWitnessPoolYamlPath())).toBe(true);
    const pool = readYamlFile(getWitnessPoolYamlPath(), witnessPoolConfigSchema);
    expect(pool.enabled).toBe(true);
    expect(pool.hubs[0]?.hub_id).toBe("HUB-C");
  });

  it("skips bind when contract has no protocol witness config", async () => {
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-100.yaml"),
      `id: CTR-100
name: Plain
counterparty: Peer
type: rental
status: executed
start_date: "2026-01-01"
`,
      "utf-8"
    );
    const result = await maybeBindWitnessPoolFromContract("CTR-100");
    expect(result?.bound).toBe(false);
    expect(result?.skipped_reason).toContain("no protocol");
  });
});
