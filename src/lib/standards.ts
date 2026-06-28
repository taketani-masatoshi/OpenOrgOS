import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getInstallRoot } from "./orgos-paths.js";

export const STEWARD_STANDARDS_DIR = join(getInstallRoot(), "steward", "standards");
export const STEWARD_ISO_DIR = join(STEWARD_STANDARDS_DIR, "iso");

/** ISO standard folder ids under steward/standards/iso/ (e.g. ISO-9001). */
export function listIsoStandardIds(): string[] {
  if (!existsSync(STEWARD_ISO_DIR)) return [];
  return readdirSync(STEWARD_ISO_DIR, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        !d.name.startsWith(".") &&
        d.name.startsWith("ISO-")
    )
    .map((d) => d.name)
    .sort();
}

export function getIsoStandardDir(standardId: string): string {
  return join(STEWARD_ISO_DIR, standardId);
}

export function getIsoStandardIndexPath(standardId: string): string {
  return join(getIsoStandardDir(standardId), "00-このフォルダについて.md");
}
