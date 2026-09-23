import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getInstallRoot } from "../../orgos-paths.js";
import { JURISDICTION_PACKS_DIR } from "../../steward-paths.js";

export const STEWARD_STANDARDS_DIR = join(getInstallRoot(), "steward", "standards");
export const STEWARD_ISO_DIR = join(STEWARD_STANDARDS_DIR, "iso");

/** Absolute path of a pack artefact (control-map, requirements, records, …). */
export function packFilePath(standard: string, file: string): string {
  if (standard === "financial") {
    return join(STEWARD_STANDARDS_DIR, "audit", "financial", file);
  }
  if (standard === "jsox") {
    return join(JURISDICTION_PACKS_DIR, "JP", "modules", "jp_jsox", file);
  }
  return join(STEWARD_ISO_DIR, standard, file);
}

/** Tenant-relative evidence folder for an ISO / pack standard. */
export function tenantEvidenceRel(standard: string): string {
  return `docs/compliance/iso/${standard}`;
}

/** ISO standard folder ids under steward/standards/iso/ (e.g. ISO-9001). */
export function listIsoStandardIds(): string[] {
  if (!existsSync(STEWARD_ISO_DIR)) return [];
  return readdirSync(STEWARD_ISO_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name.startsWith("ISO-"))
    .map((d) => d.name)
    .sort();
}

export function getIsoStandardDir(standardId: string): string {
  return join(STEWARD_ISO_DIR, standardId);
}

export function getIsoStandardIndexPath(standardId: string): string {
  return join(getIsoStandardDir(standardId), "00-このフォルダについて.md");
}
