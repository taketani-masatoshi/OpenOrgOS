import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  trustedHubsRegistrySchema,
  type TrustedHubsRegistry,
  type TrustedHubsJurisdiction,
} from "../../../schemas/protocol/trusted-hubs.js";
import type { WitnessHubEntry } from "../../../schemas/protocol/witness-pool.js";
import { ROOT_DIR, loadTenantConfig } from "../tenant.js";
import { readYamlFile } from "../utils.js";

const TRUSTED_HUBS_PATH = join(ROOT_DIR, "steward/platform/protocol/trusted-hubs.yaml");

export function loadTrustedHubsRegistry(): TrustedHubsRegistry {
  if (!existsSync(TRUSTED_HUBS_PATH)) {
    return trustedHubsRegistrySchema.parse({ version: "1", jurisdictions: [] });
  }
  return readYamlFile(TRUSTED_HUBS_PATH, trustedHubsRegistrySchema);
}

export function findTrustedHubsForJurisdiction(
  jurisdiction: string,
  registry?: TrustedHubsRegistry
): TrustedHubsJurisdiction | undefined {
  const reg = registry ?? loadTrustedHubsRegistry();
  return reg.jurisdictions.find((j) => j.jurisdiction === jurisdiction);
}

export function listTrustedHubEntries(jurisdiction?: string): WitnessHubEntry[] {
  const j = jurisdiction ?? loadTenantConfig().jurisdiction ?? "JP";
  const entry = findTrustedHubsForJurisdiction(j);
  return entry?.hubs ?? [];
}

export function getTrustedHubsRegistryPath(): string {
  return TRUSTED_HUBS_PATH;
}
