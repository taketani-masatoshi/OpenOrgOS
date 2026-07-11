import { join } from "node:path";
import { getExecutiveDir } from "../utils.js";

export function getSchedulingCasesPath(): string {
  return join(getExecutiveDir(), "scheduling-cases.yaml");
}

export function getSchedulingCasesExamplePath(): string {
  return join(getExecutiveDir(), "scheduling-cases.yaml.example");
}
