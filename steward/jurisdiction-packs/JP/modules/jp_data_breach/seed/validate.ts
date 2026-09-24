/** JP data breach module seed validator */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  breachHolidaysFileSchema,
  breachIncidentsFileSchema,
  breachSourcesFileSchema,
} from "../../../../../../schemas/jp-data-breach.js";
import { readYamlFile } from "../../../../../../src/lib/utils.js";
import { validateIncidents } from "../cli/validation.js";

export function validateModuleSeeds(seedDir: string): void {
  const incidents = readYamlFile(
    join(seedDir, "incidents.yaml.example"),
    breachIncidentsFileSchema
  );
  readYamlFile(join(seedDir, "holidays.yaml.example"), breachHolidaysFileSchema);
  const sources = readYamlFile(join(seedDir, "sources.yaml.example"), breachSourcesFileSchema);
  const issues = validateIncidents(incidents.incidents);
  for (const form of sources.forms) {
    if (!existsSync(join(seedDir, form.template)))
      issues.push(`form ${form.id}: template missing (${form.template})`);
  }
  if (issues.length) throw new Error(`jp_data_breach seed invalid:\n${issues.join("\n")}`);
}
