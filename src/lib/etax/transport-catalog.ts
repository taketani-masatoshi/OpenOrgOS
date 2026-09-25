import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  etaxTransportCatalogSchema,
  type EtaxTransportCatalog,
} from "../../../schemas/etax/transport.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { getInstallRoot } from "../orgos-paths.js";
import { ETAX_MODULE_ID } from "./constants.js";

export function etaxTransportCatalogPath(): string {
  return join(
    getInstallRoot(),
    "steward/jurisdiction-packs/JP/modules",
    ETAX_MODULE_ID,
    "spec",
    "transport-catalog.yaml",
  );
}

export function loadTransportCatalog(): EtaxTransportCatalog {
  const path = etaxTransportCatalogPath();
  if (!existsSync(path)) {
    throw etaxError({
      code: "ETAX_TRANSPORT_CATALOG_MISSING",
      blocked: "SPEC_BLOCKED",
      message: `e-tax04 transport catalog missing: ${path}`,
    });
  }
  return etaxTransportCatalogSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

export function officialTransportHostBound(catalog = loadTransportCatalog()): boolean {
  return catalog.hostBound === true;
}
