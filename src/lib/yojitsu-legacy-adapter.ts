import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { YojitsuLineKind } from "../../schemas/finance.js";
import { getTenantDir } from "./tenant.js";

export interface LegacyYojitsuFieldMap {
  segment: string;
  kind: YojitsuLineKind;
  label?: string;
}

const TENANT_LEGACY_MAP = "data/yojitsu-legacy-map.yaml";

const cachedMaps = new Map<string, Record<string, LegacyYojitsuFieldMap>>();

function parseLegacyMap(raw: unknown): Record<string, LegacyYojitsuFieldMap> {
  if (!raw || typeof raw !== "object") return {};
  const fields = (raw as { fields?: Record<string, LegacyYojitsuFieldMap> }).fields;
  return fields ?? {};
}

export function loadLegacyYojitsuFieldMap(): Record<string, LegacyYojitsuFieldMap> {
  const tenantPath = join(getTenantDir(), TENANT_LEGACY_MAP);
  const cached = cachedMaps.get(tenantPath);
  if (cached) return cached;
  if (existsSync(tenantPath)) {
    const parsed = parseLegacyMap(YAML.parse(readFileSync(tenantPath, "utf-8")));
    cachedMaps.set(tenantPath, parsed);
    return parsed;
  }

  const empty: Record<string, LegacyYojitsuFieldMap> = {};
  cachedMaps.set(tenantPath, empty);
  return empty;
}
