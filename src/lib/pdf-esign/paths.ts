/**
 * PDF e-sign file locations (tenant data + module seed examples).
 * Path: src/lib/pdf-esign/paths.ts
 */
import { join } from "node:path";
import { getInstallRoot } from "../orgos-paths.js";
import { tenantDataPath } from "../tenant.js";

export function getPdfEsignDataDir(): string {
  return tenantDataPath("pdf-esign");
}

export function getPdfEsignCasesPath(): string {
  return join(getPdfEsignDataDir(), "cases.yaml");
}

export function getPdfEsignProvidersPath(): string {
  return join(getPdfEsignDataDir(), "providers.yaml");
}

export function getNationalEidConfigPath(): string {
  return join(getPdfEsignDataDir(), "national-eid.yaml");
}

export function getDigidocRuntimeConfigPath(): string {
  return join(getPdfEsignDataDir(), "digidoc.yaml");
}

function moduleSeedDir(): string {
  return join(getInstallRoot(), "steward", "modules", "pdf_esign", "seed");
}

export function moduleNationalEidConfigExamplePath(): string {
  return join(moduleSeedDir(), "national-eid.example.yaml");
}

export function moduleDigidocRuntimeConfigExamplePath(): string {
  return join(moduleSeedDir(), "digidoc.example.yaml");
}
