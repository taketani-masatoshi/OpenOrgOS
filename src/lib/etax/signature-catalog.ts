import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  etaxSignatureCatalogSchema,
  type EtaxSignatureCatalog,
} from "../../../schemas/etax/signature.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { getInstallRoot } from "../orgos-paths.js";
import { ETAX_MODULE_ID } from "./constants.js";

export function etaxSignatureCatalogPath(): string {
  return join(
    getInstallRoot(),
    "steward/jurisdiction-packs/JP/modules",
    ETAX_MODULE_ID,
    "spec",
    "signature-catalog.yaml",
  );
}

export function loadSignatureCatalog(): EtaxSignatureCatalog {
  const path = etaxSignatureCatalogPath();
  if (!existsSync(path)) {
    throw etaxError({
      code: "ETAX_SIGNATURE_CATALOG_MISSING",
      blocked: "SPEC_BLOCKED",
      message: `e-tax05 signature catalog missing: ${path}`,
    });
  }
  return etaxSignatureCatalogSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

export function officialSignatureHostBound(catalog = loadSignatureCatalog()): boolean {
  return catalog.hostBound === true;
}
