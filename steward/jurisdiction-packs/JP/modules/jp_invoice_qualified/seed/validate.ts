import { existsSync } from "node:fs";
import { join } from "node:path";

export function validateModuleSeeds(seedDir: string): void {
  for (const name of ["invoice-registration.yaml.example", "00-README.md"]) {
    if (!existsSync(join(seedDir, name))) {
      throw new Error(`jp_invoice_qualified seed missing: ${name}`);
    }
  }
}
