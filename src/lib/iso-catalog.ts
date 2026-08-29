import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  isoCatalogFileSchema,
  type IsoCatalogEntry,
  type IsoCatalogFile,
} from "../../schemas/iso-catalog.js";
import {
  getControlMapPath,
  loadControlMapForStandard,
  loadCoreBindingsForStandard,
} from "./control-framework.js";
import { STEWARD_ISO_DIR, listIsoStandardIds } from "./standards.js";
import { readYamlFile } from "./utils.js";

export const ISO_CATALOG_REL = "steward/standards/iso/catalog.yaml";

export function isoCatalogPath(): string {
  return join(STEWARD_ISO_DIR, "catalog.yaml");
}

export function loadIsoCatalog(): IsoCatalogFile {
  return readYamlFile(isoCatalogPath(), isoCatalogFileSchema);
}

export function listIsoCatalogEntries(): IsoCatalogEntry[] {
  return loadIsoCatalog().standards;
}

/** Standards with a loadable pack — the only ones a tenant may enable. */
export function listAvailableIsoIds(): string[] {
  return listIsoCatalogEntries()
    .filter((s) => s.status === "available")
    .map((s) => s.id);
}

export function listComingSoonIsoEntries(tier?: IsoCatalogEntry["tier"]): IsoCatalogEntry[] {
  return listIsoCatalogEntries().filter(
    (s) => s.status === "coming_soon" && (tier === undefined || s.tier === tier)
  );
}

export function findIsoCatalogEntry(id: string): IsoCatalogEntry | undefined {
  return listIsoCatalogEntries().find((s) => s.id === id);
}

export interface IsoMapStatus {
  id: string;
  kind: IsoCatalogEntry["kind"];
  encoding: IsoCatalogEntry["encoding"];
  status: IsoCatalogEntry["status"];
  /** Roadmap entries are catalogued on purpose and are not verified. */
  skipped: boolean;
  folder_ok: boolean;
  map_path: string;
  map_ok: boolean;
  control_count: number;
  error?: string;
}

export function inspectIsoMap(entry: IsoCatalogEntry): IsoMapStatus {
  const folder_ok = listIsoStandardIds().includes(entry.id);
  const map_path = getControlMapPath(entry.id);
  const base: IsoMapStatus = {
    id: entry.id,
    kind: entry.kind,
    encoding: entry.encoding,
    status: entry.status,
    skipped: false,
    folder_ok,
    map_path,
    map_ok: false,
    control_count: 0,
  };
  if (entry.status === "coming_soon") {
    return { ...base, skipped: true };
  }
  if (!folder_ok) {
    return { ...base, error: "pack folder missing" };
  }
  if (!existsSync(map_path)) {
    return { ...base, error: "control-map.yaml missing" };
  }
  try {
    const controls = loadControlMapForStandard(entry.id);
    const bindings = loadCoreBindingsForStandard(entry.id);
    const mismatch = controls.some((c) => !c.iso_refs.some((r) => r.standard === entry.id));
    if (controls.length === 0 && bindings.length === 0) {
      return { ...base, error: "control-map has neither controls nor core_bindings" };
    }
    if (mismatch) {
      return {
        ...base,
        map_ok: false,
        control_count: controls.length,
        error: "control iso_refs must include catalog id",
      };
    }
    return { ...base, map_ok: true, control_count: controls.length };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}

export function listIsoMapStatuses(): IsoMapStatus[] {
  return listIsoCatalogEntries().map(inspectIsoMap);
}

export function verifyIsoMaps(): { ok: boolean; statuses: IsoMapStatus[] } {
  const statuses = listIsoMapStatuses();
  return {
    ok: statuses.every((s) => s.skipped || (s.folder_ok && s.map_ok)),
    statuses,
  };
}
