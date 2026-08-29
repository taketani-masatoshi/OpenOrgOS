import { join } from "node:path";
import { z } from "zod";
import {
  loadCompanyEvents,
  saveCompanyEvents,
  validateCompanyEvents,
} from "./company-events.js";
import { readYamlFile, getDataDir } from "./utils.js";
import {
  validateCompanyEventChainWithRegistry,
  verifyCompanyEventChain,
} from "./company-events-chain.js";
import { migrateSigningMetaToV2 } from "./company-events-signing.js";

export interface MigrateCompanyEventsChainResult {
  registry_migrated: boolean;
  signing_meta_migrated: boolean;
  dry_run: boolean;
  verify_ok: boolean;
  issues: Array<{ code: string; message: string }>;
}

export function migrateCompanyEventsChain(opts?: {
  dryRun?: boolean;
}): MigrateCompanyEventsChainResult {
  const registryPath = join(getDataDir(), "company-events.yaml");
  const rawVersion = readYamlFile(
    registryPath,
    z.object({ schema_version: z.number().optional() }).passthrough()
  ).schema_version;
  const registryMigrated = (rawVersion ?? 1) < 3;

  const registry = loadCompanyEvents();

  const signingResult = migrateSigningMetaToV2({ dryRun: opts?.dryRun });

  if (!opts?.dryRun) {
    if (registryMigrated) {
      registry.schema_version = 3;
      saveCompanyEvents(registry);
    }
  }

  const chain = verifyCompanyEventChain();
  const cross = validateCompanyEventChainWithRegistry(registry);
  const issues = [...chain.issues, ...cross.issues];

  return {
    registry_migrated: registryMigrated,
    signing_meta_migrated: signingResult.migrated,
    dry_run: opts?.dryRun === true,
    verify_ok: chain.ok && cross.ok,
    issues,
  };
}

export function runMigrateWithValidation(opts?: { dryRun?: boolean }): MigrateCompanyEventsChainResult {
  const result = migrateCompanyEventsChain(opts);
  if (!opts?.dryRun) {
    const validation = validateCompanyEvents();
    if (!validation.ok) {
      for (const issue of validation.issues) {
        result.issues.push({ code: issue.code, message: issue.message });
      }
      result.verify_ok = false;
    }
  }
  return result;
}
