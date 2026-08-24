import { existsSync } from "node:fs";
import {
  nationalEidConfigSchema,
  type NationalEidConfig,
  type NationalEidStackId,
} from "../../../schemas/pdf-esign.js";
import { readYamlFile } from "../utils.js";
import { getNationalEidConfigPath, moduleNationalEidConfigExamplePath } from "./paths.js";

export function loadNationalEidConfig(): NationalEidConfig {
  const path = getNationalEidConfigPath();
  if (existsSync(path)) {
    return readYamlFile(path, nationalEidConfigSchema);
  }
  const example = moduleNationalEidConfigExamplePath();
  if (existsSync(example)) {
    return readYamlFile(example, nationalEidConfigSchema);
  }
  return nationalEidConfigSchema.parse({ version: 1, active_stack: "EE/digidoc" });
}

export function resolveActiveNationalEidStack(
  override?: NationalEidStackId
): NationalEidStackId {
  return override ?? loadNationalEidConfig().active_stack;
}
