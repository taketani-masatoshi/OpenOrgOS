/** JP statutory meetings module seed validator */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { z } from "zod";
import {
  governanceSettingsFileSchema,
  statutoryMeetingsFileSchema,
  statutoryMeetingsSourcesFileSchema,
} from "../../../../../../schemas/jp-statutory-meetings.js";
import { governanceMeetingsFileSchema } from "../../../../../../src/lib/extension-sot.js";

const SEED_SCHEMAS: Array<[string, z.ZodTypeAny]> = [
  ["meetings.yaml.example", governanceMeetingsFileSchema],
  ["statutory-meetings.yaml.example", statutoryMeetingsFileSchema],
  ["governance-settings.yaml.example", governanceSettingsFileSchema],
  ["sources.yaml.example", statutoryMeetingsSourcesFileSchema],
];

export function validateModuleSeeds(seedDir: string): void {
  for (const [file, schema] of SEED_SCHEMAS) {
    schema.parse(YAML.parse(readFileSync(join(seedDir, file), "utf-8")));
  }
  const sources = statutoryMeetingsSourcesFileSchema.parse(
    YAML.parse(readFileSync(join(seedDir, "sources.yaml.example"), "utf-8"))
  );
  for (const template of sources.templates) {
    if (!existsSync(join(seedDir, template.template))) {
      throw new Error(`seed template missing: ${template.template}`);
    }
  }
}
