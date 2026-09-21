import { existsSync } from "node:fs";
import { join } from "node:path";

export function validateModuleSeeds(seedDir: string): void {
  for (const name of ["blue-return-line-map.yaml.example", "00-README.md"]) {
    if (!existsSync(join(seedDir, name))) {
      throw new Error(`jp_tax_individual seed missing: ${name}`);
    }
  }
}
