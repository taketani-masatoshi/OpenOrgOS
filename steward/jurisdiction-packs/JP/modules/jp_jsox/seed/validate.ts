import { existsSync } from "node:fs";
import { join } from "node:path";

export function validateModuleSeeds(seedDir: string): void {
  const required = [
    "scope.yaml.example",
    "processes.yaml.example",
    "itgc.yaml.example",
    "00-README.md",
  ];
  for (const name of required) {
    const path = join(seedDir, name);
    if (!existsSync(path)) {
      throw new Error(`jp_jsox seed missing: ${name}`);
    }
  }
}
