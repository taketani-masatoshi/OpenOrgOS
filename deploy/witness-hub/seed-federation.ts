#!/usr/bin/env node
/**
 * Mutual hub-federation.yaml for Docker Compose (HUB-A ↔ HUB-B).
 * Run after both hubs respond to /hub/v1/health.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeYamlFile } from "../../src/lib/utils.js";
import { hubFederationSchema } from "../../schemas/protocol/hub-federation.js";

const ROOT = join(import.meta.dirname, "..", "..");
const HUB_A_DIR = process.env.HUB_A_DATA_DIR ?? join(ROOT, "deploy/witness-hub/data/hub-a");
const HUB_B_DIR = process.env.HUB_B_DATA_DIR ?? join(ROOT, "deploy/witness-hub/data/hub-b");
const HUB_A_URL = process.env.HUB_A_URL ?? "http://127.0.0.1:9474";
const HUB_B_URL = process.env.HUB_B_URL ?? "http://127.0.0.1:9475";

async function fetchPublicKey(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/hub/v1/public-key`);
  if (!res.ok) throw new Error(`public-key fetch failed: ${baseUrl} HTTP ${res.status}`);
  const body = (await res.json()) as { public_key?: string };
  if (!body.public_key) throw new Error(`public-key missing from ${baseUrl}`);
  return body.public_key;
}

async function waitHealth(baseUrl: string, attempts = 30): Promise<void> {
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

async function main(): Promise<void> {
  await waitHealth(HUB_A_URL);
  await waitHealth(HUB_B_URL);

  const hubAKey = await fetchPublicKey(HUB_A_URL);
  const hubBKey = await fetchPublicKey(HUB_B_URL);

  mkdirSync(HUB_A_DIR, { recursive: true });
  mkdirSync(HUB_B_DIR, { recursive: true });

  writeYamlFile(
    join(HUB_A_DIR, "hub-federation.yaml"),
    hubFederationSchema.parse({
      hub_id: "HUB-A",
      gossip: { enabled: true, interval_sec: 300 },
      hub_peers: [{ hub_id: "HUB-B", hub_url: HUB_B_URL, hub_public_key: hubBKey, priority: 1 }],
    })
  );

  writeYamlFile(
    join(HUB_B_DIR, "hub-federation.yaml"),
    hubFederationSchema.parse({
      hub_id: "HUB-B",
      gossip: { enabled: true, interval_sec: 300 },
      hub_peers: [{ hub_id: "HUB-A", hub_url: HUB_A_URL, hub_public_key: hubAKey, priority: 1 }],
    })
  );

  console.log("✓ federation seeded: HUB-A ↔ HUB-B");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
