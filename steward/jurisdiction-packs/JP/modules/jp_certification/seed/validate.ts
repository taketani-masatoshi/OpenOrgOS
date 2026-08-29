import { existsSync } from "node:fs";
import { join } from "node:path";

/** Minimal seed validator — certification registry examples present. */
export function validateModuleSeeds(seedDir: string): void {
  const required = [
    "certification-types.yaml.example",
    "certification-registry.yaml.example",
    "00-README.md",
  ];
  for (const name of required) {
    const path = join(seedDir, name);
    if (!existsSync(path)) {
      throw new Error(`jp_certification seed missing: ${name}`);
    }
  }
}
