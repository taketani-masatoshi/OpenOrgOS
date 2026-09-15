import { existsSync } from "node:fs";
import { join } from "node:path";

export function validateModuleSeeds(seedDir: string): void {
  for (const name of [
    "chart-of-accounts.yaml.example",
    "expense-line-map.yaml.example",
    "blue-return-filing.yaml.example",
    "00-README.md",
  ]) {
    if (!existsSync(join(seedDir, name))) {
      throw new Error(`jp_sole_proprietor_blue_return seed missing: ${name}`);
    }
  }
}
