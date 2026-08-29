import { existsSync } from "node:fs";
import { join } from "node:path";

/** Minimal seed validator — inspection registry examples present. */
export function validateModuleSeeds(seedDir: string): void {
  const required = [
    "inspection-types.yaml.example",
    "inspection-registry.yaml.example",
    "00-README.md",
  ];
  for (const name of required) {
    const path = join(seedDir, name);
    if (!existsSync(path)) {
      throw new Error(`jp_inspection seed missing: ${name}`);
    }
  }
}
