import { join } from "node:path";
import {
  isoCatalogFileSchema,
  type IsoCatalogEntry,
  type IsoCatalogFile,
} from "../../../../schemas/iso-catalog.js";
import { STEWARD_ISO_DIR, listIsoStandardIds } from "../packs/paths.js";
import { readYamlFile } from "../../utils.js";

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
  const packIds = new Set(listIsoStandardIds());
  return listIsoCatalogEntries()
    .filter((entry) => entry.status === "available" && packIds.has(entry.id))
    .map((entry) => entry.id);
}

export function listComingSoonIsoEntries(tier?: IsoCatalogEntry["tier"]): IsoCatalogEntry[] {
  return listIsoCatalogEntries().filter(
    (entry) => entry.status === "coming_soon" && (tier === undefined || entry.tier === tier)
  );
}

export function findIsoCatalogEntry(id: string): IsoCatalogEntry | undefined {
  return listIsoCatalogEntries().find((entry) => entry.id === id);
}
