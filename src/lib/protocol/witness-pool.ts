import { existsSync } from "node:fs";
import {
  witnessPoolConfigSchema,
  type WitnessPoolConfig,
  type WitnessHubEntry,
} from "../../../schemas/protocol/witness-pool.js";
import { getWitnessPoolYamlPath } from "./paths.js";
import { loadRegistryFile } from "../utils.js";

export function loadWitnessPoolConfig(): WitnessPoolConfig {
  return loadRegistryFile(getWitnessPoolYamlPath(), witnessPoolConfigSchema, () =>
    witnessPoolConfigSchema.parse({ enabled: false, hubs: [] })
  );
}

export function isWitnessEnabled(config?: WitnessPoolConfig): boolean {
  const pool = config ?? loadWitnessPoolConfig();
  return pool.enabled && pool.hubs.length > 0;
}

export function sortedHubs(config?: WitnessPoolConfig): WitnessHubEntry[] {
  const pool = config ?? loadWitnessPoolConfig();
  return [...pool.hubs].sort((a, b) => a.priority - b.priority);
}

export function findHubInPool(hubId: string, config?: WitnessPoolConfig): WitnessHubEntry | undefined {
  return sortedHubs(config).find((h) => h.hub_id === hubId);
}

export function witnessPoolFileExists(): boolean {
  return existsSync(getWitnessPoolYamlPath());
}

export function shouldRegisterWitnessSide(
  side: "sent" | "received",
  pool?: WitnessPoolConfig
): boolean {
  const cfg = pool ?? loadWitnessPoolConfig();
  if (!isWitnessEnabled(cfg)) return false;
  if (cfg.register_on === "both") return true;
  if (cfg.register_on === "approve" && side === "sent") return true;
  if (cfg.register_on === "ingest" && side === "received") return true;
  return false;
}
