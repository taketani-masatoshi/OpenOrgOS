#!/usr/bin/env node
/**
 * Mutual hub-federation.yaml for Docker Compose (HUB-A/B/C/D mesh).
 * Seeds tenant witness-pool.yaml (k=3 · n=4) for mal + southwood.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeYamlFile } from "../../src/lib/utils.js";
import { hubFederationSchema } from "../../schemas/protocol/hub-federation.js";
import { witnessPoolConfigSchema } from "../../schemas/protocol/witness-pool.js";

const ROOT = join(import.meta.dirname, "..", "..");

type HubSpec = {
  id: string;
  url: string;
  dataDir: string;
};

function hubSpecs(): HubSpec[] {
  return [
    {
      id: "HUB-A",
      url: process.env.HUB_A_URL ?? "http://127.0.0.1:9474",
      dataDir: process.env.HUB_A_DATA_DIR ?? join(ROOT, "deploy/witness-hub/data/hub-a"),
    },
    {
      id: "HUB-B",
      url: process.env.HUB_B_URL ?? "http://127.0.0.1:9475",
      dataDir: process.env.HUB_B_DATA_DIR ?? join(ROOT, "deploy/witness-hub/data/hub-b"),
    },
    {
      id: "HUB-C",
      url: process.env.HUB_C_URL ?? "http://127.0.0.1:9476",
      dataDir: process.env.HUB_C_DATA_DIR ?? join(ROOT, "deploy/witness-hub/data/hub-c"),
    },
    {
      id: "HUB-D",
      url: process.env.HUB_D_URL ?? "http://127.0.0.1:9477",
      dataDir: process.env.HUB_D_DATA_DIR ?? join(ROOT, "deploy/witness-hub/data/hub-d"),
    },
  ];
}

async function fetchPublicKey(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/hub/v1/public-key`);
  if (!res.ok) throw new Error(`public-key fetch failed: ${baseUrl} HTTP ${res.status}`);
  const body = (await res.json()) as { public_key?: string };
  if (!body.public_key) throw new Error(`public-key missing from ${baseUrl}`);
  return body.public_key;
}

async function waitHealth(baseUrl: string, attempts = 60): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/hub/v1/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`hub not healthy: ${baseUrl}`);
}

function writeTenantWitnessPool(tenantId: string, hubs: Array<{ hub_id: string; hub_url: string; hub_public_key: string; priority: number }>): void {
  const poolDir = join(ROOT, "tenants", tenantId, "data", "protocol");
  mkdirSync(poolDir, { recursive: true });
  writeYamlFile(
    join(poolDir, "witness-pool.yaml"),
    witnessPoolConfigSchema.parse({
      enabled: true,
      quorum: { mode: "k_of_n", k: 3 },
      register_on: "both",
      wire_governance_policy: { require_quorum_for_tiers: ["A", "B"], warn_only: true },
      hubs,
    })
  );
}

async function main(): Promise<void> {
  const specs = hubSpecs();

  for (const hub of specs) {
    await waitHealth(hub.url);
  }

  const keys = new Map<string, string>();
  for (const hub of specs) {
    keys.set(hub.id, await fetchPublicKey(hub.url));
  }

  for (const hub of specs) {
    mkdirSync(hub.dataDir, { recursive: true });
    const peers = specs
      .filter((p) => p.id !== hub.id)
      .map((p, idx) => ({
        hub_id: p.id,
        hub_url: p.url,
        hub_public_key: keys.get(p.id)!,
        priority: idx + 1,
      }));

    writeYamlFile(
      join(hub.dataDir, "hub-federation.yaml"),
      hubFederationSchema.parse({
        hub_id: hub.id,
        gossip: { enabled: true, interval_sec: 300 },
        hub_peers: peers,
      })
    );
  }

  const hostPoolHubs = specs.map((h, idx) => {
    const port = h.url.match(/:(\d+)/)?.[1] ?? "9474";
    return {
      hub_id: h.id,
      hub_url: `http://127.0.0.1:${port}`,
      hub_public_key: keys.get(h.id)!,
      priority: idx + 1,
    };
  });

  for (const tenantId of ["mal", "southwood"]) {
    writeTenantWitnessPool(tenantId, hostPoolHubs);
  }

  console.log("✓ federation seeded: HUB-A/B/C/D (full mesh)");
  console.log("✓ witness-pool.yaml: mal + southwood · k=3 · n=4");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
