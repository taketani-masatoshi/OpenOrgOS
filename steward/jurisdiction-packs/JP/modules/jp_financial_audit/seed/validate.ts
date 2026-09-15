import { existsSync } from "node:fs";
import { join } from "node:path";

export function validateModuleSeeds(seedDir: string): void {
  if (!existsSync(join(seedDir, "00-README.md"))) {
    throw new Error("jp_financial_audit seed missing: 00-README.md");
  }
}
