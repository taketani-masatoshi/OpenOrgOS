import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getWorkspaceRoot } from "../orgos-paths.js";
import { getClock } from "../runtime-context.js";

const drillSchema = z.object({
  version: z.literal(1),
  drills: z.array(
    z.object({
      tenant_id: z.string(),
      archive_path: z.string(),
      ok: z.boolean(),
      validated: z.boolean(),
      at: z.string(),
      note: z.string().optional(),
    }),
  ),
});

function drillsPath(): string {
  return join(getWorkspaceRoot(), "product-fleet", "restore-drills.yaml");
}

export function loadRestoreDrills() {
  const path = drillsPath();
  if (!existsSync(path)) {
    return drillSchema.parse({ version: 1, drills: [] });
  }
  return drillSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

export function recordRestoreDrill(input: {
  tenantId: string;
  archivePath: string;
  ok: boolean;
  validated: boolean;
  note?: string;
}): void {
  const file = loadRestoreDrills();
  file.drills.push({
    tenant_id: input.tenantId,
    archive_path: input.archivePath,
    ok: input.ok,
    validated: input.validated,
    at: getClock().now().toISOString(),
    note: input.note,
  });
  mkdirSync(join(getWorkspaceRoot(), "product-fleet"), { recursive: true });
  writeFileSync(drillsPath(), YAML.stringify(file), "utf-8");
}

export function hasRecentRestoreDrill(maxAgeDays = 90): boolean {
  const file = loadRestoreDrills();
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  return file.drills.some(
    (row) => row.ok && row.validated && Date.parse(row.at) >= cutoff,
  );
}


/** Commercial quality: two consecutive recent successes, or high success rate with latest ok. */
export function hasQualityRestoreDrill(maxAgeDays = 90): boolean {
  const file = loadRestoreDrills();
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const recent = file.drills.filter((row) => Date.parse(row.at) >= cutoff);
  if (recent.length === 0) return false;
  const last = recent[recent.length - 1];
  if (!(last.ok && last.validated)) return false;
  if (recent.length >= 2) {
    const a = recent[recent.length - 1];
    const b = recent[recent.length - 2];
    if (a.ok && a.validated && b.ok && b.validated) return true;
  }
  const window = recent.slice(-5);
  if (window.length >= 3) {
    const okCount = window.filter((row) => row.ok && row.validated).length;
    if (okCount / window.length >= 0.8) return true;
  }
  // Single recent success is insufficient for commercial claim.
  return false;
}
