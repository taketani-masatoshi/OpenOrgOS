#!/usr/bin/env node
/**
 * Mutual hub-federation.yaml for Docker Compose (city-named global pool).
 * Seeds tenant witness-pool.yaml (k=3 · n=4 core) for mal + southwood.
 * Spec: deploy/witness-hub/hubs-city.yaml · witness-hub-governance.md §7.B
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { mkdirSync } from "node:fs";
import { writeYamlFile } from "../../src/lib/utils.js";
import { hubFederationSchema } from "../../schemas/protocol/hub-federation.js";
import { witnessPoolConfigSchema } from "../../schemas/protocol/witness-pool.js";

const ROOT = join(import.meta.dirname, "..", "..");

type CityHubSpec = {
  hub_id: string;
  city: string;
  wave: number;
  port: number;
  data_dir: string;
};

type HubsCityCatalog = {
  version: string;
  quorum: { mode: string; k: number };
  core: CityHubSpec[];
  global?: CityHubSpec[];
};

function loadCatalog(): HubsCityCatalog {
  const raw = readFileSync(join(import.meta.dirname, "hubs-city.yaml"), "utf-8");
  return YAML.parse(raw) as HubsCityCatalog;
}

function resolvePool(poolName: string): CityHubSpec[] {
  const catalog = loadCatalog();
  const core = catalog.core;
  if (poolName === "global") {
    return [...core, ...(catalog.global ?? [])];
  }
  return core;
}

function hubUrl(hub: CityHubSpec, dockerHost: string): string {
  const envKey = `HUB_${hub.hub_id.replace(/-/g, "_")}_URL`;
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv) return fromEnv;
  const dockerOverride = process.env[`DOCKER_${hub.hub_id.replace(/-/g, "_")}_URL`]?.trim();
  if (dockerOverride) return dockerOverride;
  if (dockerHost === "docker") {
    const serviceMap: Record<string, string> = {
      "HUB-APAC-JP": "http://hub-tokyo:9474",
      "HUB-ME": "http://hub-dubai:9475",
      "HUB-EU-EE": "http://hub-tallinn:9476",
      "HUB-EU-IE": "http://hub-dublin:9477",
      "HUB-TR-IST": "http://hub-istanbul:9478",
      "HUB-US": "http://hub-nyc:9479",
      "HUB-SA": "http://hub-santiago:9480",
      "HUB-OCEANIA-NZ": "http://hub-auckland:9481",
    };
    return serviceMap[hub.hub_id] ?? `http://127.0.0.1:${hub.port}`;
  }
  return `http://127.0.0.1:${hub.port}`;
}

function dataDir(hub: CityHubSpec): string {
  const envKey = `HUB_${hub.hub_id.replace(/-/g, "_")}_DATA_DIR`;
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv) return fromEnv;
  return join(ROOT, "deploy/witness-hub/data", hub.data_dir);
}

function toSpecs(pool: CityHubSpec[]): Array<{ id: string; url: string; dataDir: string; city: string }> {
  const dockerHost = process.env.HUB_DOCKER_NETWORK === "1" ? "docker" : "host";
  return pool.map((h) => ({
    id: h.hub_id,
    url: hubUrl(h, dockerHost),
    dataDir: dataDir(h),
    city: h.city,
  }));
}

/** Legacy HUB-A/B/C/D env override (docker-compose.yaml). */
function legacyHubSpecs(): Array<{ id: string; url: string; dataDir: string; city: string }> | null {
  if (!process.env.HUB_A_URL) return null;
  return [
    {
      id: "HUB-A",
      url: process.env.HUB_A_URL,
      dataDir: process.env.HUB_A_DATA_DIR ?? join(ROOT, "deploy/witness-hub/data/hub-a"),
      city: "legacy-A",
    },
    {
      id: "HUB-B",
      url: process.env.HUB_B_URL ?? "http://127.0.0.1:9475",
      dataDir: process.env.HUB_B_DATA_DIR ?? join(ROOT, "deploy/witness-hub/data/hub-b"),
      city: "legacy-B",
    },
    {
      id: "HUB-C",
      url: process.env.HUB_C_URL ?? "http://127.0.0.1:9476",
      dataDir: process.env.HUB_C_DATA_DIR ?? join(ROOT, "deploy/witness-hub/data/hub-c"),
      city: "legacy-C",
    },
    {
      id: "HUB-D",
      url: process.env.HUB_D_URL ?? "http://127.0.0.1:9477",
      dataDir: process.env.HUB_D_DATA_DIR ?? join(ROOT, "deploy/witness-hub/data/hub-d"),
      city: "legacy-D",
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

async function waitHealth(baseUrl: string, attempts = 90): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/hub/v1/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`hub not healthy: ${baseUrl}`);
}

function writeTenantWitnessPool(
  tenantId: string,
  hubs: Array<{ hub_id: string; hub_url: string; hub_public_key: string; priority: number }>,
  quorum: { mode: "k_of_n"; k: number } | { mode: "any_of_n" }
): void {
  const poolDir = join(ROOT, "tenants", tenantId, "data", "protocol");
  mkdirSync(poolDir, { recursive: true });
  writeYamlFile(
    join(poolDir, "witness-pool.yaml"),
    witnessPoolConfigSchema.parse({
      enabled: true,
      quorum,
      register_on: "both",
      wire_governance_policy: { require_quorum_for_tiers: ["A", "B"], warn_only: true },
      hubs,
    })
  );
}

function writeTrustedHubsDockerSnippet(
  hubs: Array<{ hub_id: string; hub_url: string; hub_public_key: string; city: string; priority: number }>
): void {
  const out = join(ROOT, "deploy/witness-hub/data/trusted-hubs-docker.generated.yaml");
  mkdirSync(join(out, ".."), { recursive: true });
  const doc = {
    version: "1",
    notes: "Auto-generated by seed-federation.ts — local Docker city hubs (do not publish as-is)",
    jurisdictions: [
      {
        jurisdiction: "GLOBAL_DOCKER",
        notes: "City-named Witness Hub pool · k=3 · witness-hub-governance.md §7.B",
        hubs: hubs.map((h) => ({
          hub_id: h.hub_id,
          hub_url: h.hub_url,
          hub_public_key: h.hub_public_key,
          priority: h.priority,
          city: h.city,
        })),
      },
    ],
  };
  writeYamlFile(out, doc);
}

async function main(): Promise<void> {
  const poolName = process.env.HUB_POOL ?? "core";
  const catalog = loadCatalog();
  const pool = resolvePool(poolName);
  const legacy = legacyHubSpecs();
  const specs = legacy ?? toSpecs(pool);
  const quorumK = catalog.quorum.k ?? 3;
  const quorum =
    specs.length >= quorumK
      ? ({ mode: "k_of_n" as const, k: quorumK })
      : ({ mode: "any_of_n" as const });

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

  const hostPoolHubs = specs.map((h, idx) => ({
    hub_id: h.id,
    hub_url: legacy
      ? h.url.replace(/hub-[a-z]+:/, "127.0.0.1:").replace(/\/\/[^/]+:/, (m) => {
          const port = h.url.match(/:(\d+)/)?.[1];
          return port ? `//127.0.0.1:${port}` : m;
        })
      : `http://127.0.0.1:${pool.find((p) => p.hub_id === h.id)?.port ?? 9474}`,
    hub_public_key: keys.get(h.id)!,
    priority: idx + 1,
    city: h.city,
  }));

  // Fix host URLs for city pool (always localhost from host)
  if (!legacy) {
    for (let i = 0; i < hostPoolHubs.length; i++) {
      const spec = pool.find((p) => p.hub_id === hostPoolHubs[i]!.hub_id);
      if (spec) hostPoolHubs[i]!.hub_url = `http://127.0.0.1:${spec.port}`;
    }
  } else {
    for (let i = 0; i < hostPoolHubs.length; i++) {
      const port = specs[i]!.url.match(/:(\d+)/)?.[1];
      if (port) hostPoolHubs[i]!.hub_url = `http://127.0.0.1:${port}`;
    }
  }

  for (const tenantId of ["mal", "southwood"]) {
    writeTenantWitnessPool(
      tenantId,
      hostPoolHubs.map(({ hub_id, hub_url, hub_public_key, priority }) => ({
        hub_id,
        hub_url,
        hub_public_key,
        priority,
      })),
      quorum
    );
  }

  if (!legacy) {
    writeTrustedHubsDockerSnippet(hostPoolHubs);
  }

  const ids = specs.map((s) => `${s.id} (${s.city})`).join(", ");
  console.log(`✓ federation seeded: ${ids}`);
  console.log(`✓ witness-pool.yaml: mal + southwood · ${quorum.mode} · n=${specs.length}`);
  if (!legacy) {
    console.log("✓ trusted-hubs-docker.generated.yaml written");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
