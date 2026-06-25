import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ROOT_DIR } from "./tenant.js";
import { readYamlFile } from "./utils.js";

export const READINESS_TIERS = ["skeleton", "activation_ready", "production_ready"] as const;
export type ReadinessTier = (typeof READINESS_TIERS)[number];

const readinessSchema = z.object({
  modules: z.record(
    z.object({
      tier: z.enum(READINESS_TIERS),
      notes: z.string().optional(),
    })
  ),
});

const READINESS_PATH = join(ROOT_DIR, "steward", "modules", "readiness.yaml");

export function loadModuleReadiness(): Map<string, { tier: ReadinessTier; notes?: string }> {
  if (!existsSync(READINESS_PATH)) return new Map();
  const data = readYamlFile(READINESS_PATH, readinessSchema);
  return new Map(Object.entries(data.modules));
}

export function getModuleTier(catalogId: string): ReadinessTier {
  return loadModuleReadiness().get(catalogId)?.tier ?? "skeleton";
}
