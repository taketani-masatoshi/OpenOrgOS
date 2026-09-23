import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  agreementsFileSchema,
  employmentRulesSourcesFileSchema,
  overtimeRecordsFileSchema,
  workRulesFileSchema,
  workplacesFileSchema,
} from "../../../../../../schemas/jp-employment-rules.js";
import { readYamlFile } from "../../../../../../src/lib/utils.js";

const SEED_SCHEMAS = [
  ["workplaces.yaml.example", workplacesFileSchema],
  ["work-rules.yaml.example", workRulesFileSchema],
  ["agreements.yaml.example", agreementsFileSchema],
  ["overtime-records.yaml.example", overtimeRecordsFileSchema],
  ["sources.yaml.example", employmentRulesSourcesFileSchema],
] as const;

const SEED_TEMPLATES = ["templates/work-rules.md.example", "templates/36-agreement.md.example", "00-README.md"];

/** Seed validator — every YAML seed parses with its schema and templates exist. */
export function validateModuleSeeds(seedDir: string): void {
  for (const [name, schema] of SEED_SCHEMAS) {
    readYamlFile(join(seedDir, name), schema);
  }
  for (const name of SEED_TEMPLATES) {
    if (!existsSync(join(seedDir, name))) {
      throw new Error(`jp_employment_rules seed missing: ${name}`);
    }
  }
}
