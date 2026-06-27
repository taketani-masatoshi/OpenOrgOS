import { writeYamlFile } from "../utils.js";
import { getWitnessPoolYamlPath } from "./paths.js";
import { witnessPoolConfigSchema } from "../../schemas/protocol/witness-pool.js";
import { findTrustedHubsForJurisdiction } from "./trusted-hubs.js";
import type { WitnessHubEntry } from "../../schemas/protocol/witness-pool.js";

export async function initWitnessPoolFromTrusted(jurisdiction: string): Promise<{
  path: string;
  hubs: WitnessHubEntry[];
}> {
  const entry = findTrustedHubsForJurisdiction(jurisdiction);
  if (!entry || entry.hubs.length === 0) {
    throw new Error(`No trusted hubs for jurisdiction ${jurisdiction}`);
  }

  const hubs: WitnessHubEntry[] = [];
  for (const hub of entry.hubs) {
    let hubPublicKey = hub.hub_public_key;
    if (!hubPublicKey) {
      const base = hub.hub_url.replace(/\/$/, "");
      const res = await fetch(`${base}/hub/v1/public-key`);
      if (!res.ok) {
        throw new Error(`Failed to fetch public key from ${hub.hub_id} at ${hub.hub_url}`);
      }
      const body = (await res.json()) as { public_key?: string };
      if (!body.public_key) {
        throw new Error(`No public_key in response from ${hub.hub_id}`);
      }
      hubPublicKey = body.public_key;
    }
    hubs.push({ ...hub, hub_public_key: hubPublicKey });
  }

  const config = witnessPoolConfigSchema.parse({
    enabled: true,
    quorum: { mode: "any_of_n" },
    register_on: "both",
    hubs,
    wire_governance_policy: {
      require_quorum_for_tiers: ["B", "C"],
      warn_only: true,
    },
  });

  const path = getWitnessPoolYamlPath();
  writeYamlFile(path, config);
  return { path, hubs };
}
