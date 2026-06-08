import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ROOT_DIR } from "./tenant.js";
import { readYamlFile } from "./utils.js";

const readinessSchema = z.object({
  modules: z.record(
    z.object({
      tier: z.enum(["production_ready", "seed_only"]),
      notes: z.string().optional(),
    })
  ),
});

const READINESS_PATH = join(ROOT_DIR, "steward", "modules", "readiness.yaml");

export function loadModuleReadiness(): Map<string, { tier: string; notes?: string }> {
  if (!existsSync(READINESS_PATH)) return new Map();
  const data = readYamlFile(READINESS_PATH, readinessSchema);
  return new Map(Object.entries(data.modules));
}

export function getModuleTier(catalogId: string): string {
  return loadModuleReadiness().get(catalogId)?.tier ?? "seed_only";
}
