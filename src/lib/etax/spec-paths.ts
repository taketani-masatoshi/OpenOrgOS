import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getInstallRoot } from "../orgos-paths.js";
import { ETAX_SPEC_RELATIVE_DIR } from "./constants.js";

export function etaxVendorDir(): string {
  return join(getInstallRoot(), ETAX_SPEC_RELATIVE_DIR, "vendor");
}

export function etaxVendorCabPath(id: string): string {
  return join(etaxVendorDir(), `${id}.CAB`);
}

export function etaxUnpackedDir(id: string): string {
  return join(etaxVendorDir(), "unpacked", id);
}

export function officialXsdRoot(): string {
  return etaxUnpackedDir("e-tax19");
}

export function officialXsdAvailable(): boolean {
  return existsSync(join(officialXsdRoot(), "general", "General.xsd"));
}

export function vendorCabPresent(id: string): boolean {
  return existsSync(etaxVendorCabPath(id));
}

export function countFilesWithExt(dir: string, ext: string): number {
  let n = 0;
  const walk = (current: string): void => {
    if (!existsSync(current)) return;
    for (const ent of readdirSync(current, { withFileTypes: true })) {
      const p = join(current, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.toLowerCase().endsWith(ext)) n += 1;
    }
  };
  walk(dir);
  return n;
}
