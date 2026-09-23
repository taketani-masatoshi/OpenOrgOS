/** jp_visa_employment seed validator (catalog harness · schema + cross-reference checks). */
import { join } from "node:path";
import {
  foreignWorkersFileSchema,
  statusCatalogFileSchema,
  visaSourcesFileSchema,
  weeklyHoursFileSchema,
} from "../../../../../../schemas/jp-visa-employment.js";
import { readYamlFile } from "../../../../../../src/lib/utils.js";
import { collectValidationIssues } from "../cli/validation.js";

export function validateModuleSeeds(seedDir: string): void {
  const dataset = {
    workers: readYamlFile(join(seedDir, "foreign-workers.yaml.example"), foreignWorkersFileSchema),
    weeks: readYamlFile(join(seedDir, "weekly-hours.yaml.example"), weeklyHoursFileSchema),
    catalog: readYamlFile(join(seedDir, "status-catalog.yaml.example"), statusCatalogFileSchema),
  };
  readYamlFile(join(seedDir, "sources.yaml.example"), visaSourcesFileSchema);
  const issues = collectValidationIssues(dataset);
  if (issues.length > 0) throw new Error(`jp_visa_employment seed issues:\n${issues.join("\n")}`);
}
