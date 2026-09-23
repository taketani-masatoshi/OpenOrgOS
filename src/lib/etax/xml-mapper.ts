import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  etaxProcedureMappingSchema,
  type EtaxProcedureMapping,
} from "../../../schemas/etax/mapping.js";
import { getInstallRoot } from "../orgos-paths.js";
import { ETAX_SPEC_RELATIVE_DIR } from "./constants.js";

export function etaxMappingsDir(): string {
  return join(getInstallRoot(), ETAX_SPEC_RELATIVE_DIR, "mappings");
}

export function procedureMappingPath(procedureCode: string): string {
  return join(etaxMappingsDir(), `${procedureCode}.yaml`);
}

export function loadProcedureMapping(procedureCode: string): EtaxProcedureMapping | undefined {
  const path = procedureMappingPath(procedureCode);
  if (!existsSync(path)) return undefined;
  return etaxProcedureMappingSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}
