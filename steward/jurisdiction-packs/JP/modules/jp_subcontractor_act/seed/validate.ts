/** jp_subcontractor_act seed validator (catalog harness) */
import { join } from "node:path";
import type { ZodTypeAny } from "zod";
import {
  subcontractPartiesFileSchema,
  subcontractSettingsFileSchema,
  subcontractSourcesFileSchema,
  subcontractTransactionsFileSchema,
} from "../../../../../../schemas/jp-subcontractor-act.js";
import { readYamlFile } from "../../../../../../src/lib/utils.js";

const SEED_SCHEMAS: ReadonlyArray<[string, ZodTypeAny]> = [
  ["settings.yaml.example", subcontractSettingsFileSchema],
  ["subcontract-parties.yaml.example", subcontractPartiesFileSchema],
  ["transactions.yaml.example", subcontractTransactionsFileSchema],
  ["sources.yaml.example", subcontractSourcesFileSchema],
];

export function validateModuleSeeds(seedDir: string): void {
  for (const [filename, schema] of SEED_SCHEMAS) {
    readYamlFile(join(seedDir, filename), schema);
  }
}
