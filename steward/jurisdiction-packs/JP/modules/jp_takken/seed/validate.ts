import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { z } from "zod";
import {
  takkenLicenseFileSchema,
  takkenOfficesFileSchema,
  takkenSettingsFileSchema,
  takkenSourcesFileSchema,
  takkenTransactionsFileSchema,
} from "../../../../../../schemas/jp-takken.js";

const SEED_SCHEMAS: ReadonlyArray<readonly [string, z.ZodTypeAny]> = [
  ["license.yaml.example", takkenLicenseFileSchema],
  ["offices.yaml.example", takkenOfficesFileSchema],
  ["transactions.yaml.example", takkenTransactionsFileSchema],
  ["settings.yaml.example", takkenSettingsFileSchema],
  ["sources.yaml.example", takkenSourcesFileSchema],
];

const REQUIRED_DOCS = ["00-README.md", "templates/document-checklist.md.example"];

/** Seed validator — every business seed parses against its jp_takken schema. */
export function validateModuleSeeds(seedDir: string): void {
  for (const name of REQUIRED_DOCS) {
    if (!existsSync(join(seedDir, name))) throw new Error(`jp_takken seed missing: ${name}`);
  }
  for (const [name, schema] of SEED_SCHEMAS) {
    const path = join(seedDir, name);
    if (!existsSync(path)) throw new Error(`jp_takken seed missing: ${name}`);
    schema.parse(YAML.parse(readFileSync(path, "utf-8")));
  }
}
