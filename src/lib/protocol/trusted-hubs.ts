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

export interface TrustedHubValidationIssue {
  code: string;
  message: string;
}

export function validateTrustedHubsRegistry(): {
  ok: boolean;
  issues: TrustedHubValidationIssue[];
  warnings: TrustedHubValidationIssue[];
} {
  const issues: TrustedHubValidationIssue[] = [];
  const warnings: TrustedHubValidationIssue[] = [];

  try {
    const reg = loadTrustedHubsRegistry();
    const seenJurisdictions = new Set<string>();
    for (const entry of reg.jurisdictions) {
      if (seenJurisdictions.has(entry.jurisdiction)) {
        issues.push({
          code: "trusted-hub-duplicate-jurisdiction",
          message: `Duplicate jurisdiction entry: ${entry.jurisdiction}`,
        });
      }
      seenJurisdictions.add(entry.jurisdiction);

      const seenHubIds = new Set<string>();
      for (const hub of entry.hubs) {
        if (seenHubIds.has(hub.hub_id)) {
          issues.push({
            code: "trusted-hub-duplicate-id",
            message: `${entry.jurisdiction}: duplicate hub_id ${hub.hub_id}`,
          });
        }
        seenHubIds.add(hub.hub_id);
        if (!hub.hub_url) {
          issues.push({
            code: "trusted-hub-missing-url",
            message: `${entry.jurisdiction}/${hub.hub_id}: hub_url missing`,
          });
        }
        if (!hub.hub_public_key) {
          warnings.push({
            code: "trusted-hub-missing-key",
            message: `${entry.jurisdiction}/${hub.hub_id}: hub_public_key empty (pin before production)`,
          });
        }
      }
    }
  } catch (e) {
    issues.push({
      code: "trusted-hubs-invalid",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  return { ok: issues.length === 0, issues, warnings };
}
