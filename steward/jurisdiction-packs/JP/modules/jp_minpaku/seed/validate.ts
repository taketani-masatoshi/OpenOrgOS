import { existsSync } from "node:fs";
import { join } from "node:path";

/** Minimal seed validator — example ops public profile present. */
export function validateModuleSeeds(seedDir: string): void {
  const required = ["operations-public.yaml.example", "00-README.md"];
  for (const name of required) {
    const path = join(seedDir, name);
    if (!existsSync(path)) {
      throw new Error(`jp_minpaku seed missing: ${name}`);
    }
  }
}
