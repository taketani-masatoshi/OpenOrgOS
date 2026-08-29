import { existsSync } from "node:fs";
import { join } from "node:path";

export function validateModuleSeeds(seedDir: string): void {
  for (const name of [
    "social-insurance-rates-2026.yaml.example",
    "enrollment-summary.yaml.example",
  ]) {
    if (!existsSync(join(seedDir, name))) {
      throw new Error(`jp_social_insurance seed missing: ${name}`);
    }
  }
}
