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

let _cachedMap: Record<string, LegacyYojitsuFieldMap> | null = null;

function parseLegacyMap(raw: unknown): Record<string, LegacyYojitsuFieldMap> {
  if (!raw || typeof raw !== "object") return {};
  const fields = (raw as { fields?: Record<string, LegacyYojitsuFieldMap> }).fields;
  return fields ?? {};
}

export function loadLegacyYojitsuFieldMap(): Record<string, LegacyYojitsuFieldMap> {
  if (_cachedMap) return _cachedMap;

  const tenantPath = join(getTenantDir(), TENANT_LEGACY_MAP);
  if (existsSync(tenantPath)) {
    _cachedMap = parseLegacyMap(YAML.parse(readFileSync(tenantPath, "utf-8")));
    return _cachedMap;
  }

  _cachedMap = {};
  return _cachedMap;
}
