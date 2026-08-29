import { existsSync } from "node:fs";
import { join } from "node:path";
import { consumptionRefundClaimsFileSchema } from "../cli/schema.js";
import { readFileSync } from "node:fs";
import YAML from "yaml";

export function validateModuleSeeds(seedDir: string): void {
  for (const name of ["consumption-refund-claims.yaml.example", "00-README.md"]) {
    if (!existsSync(join(seedDir, name))) {
      throw new Error(`jp_consumption_refund seed missing: ${name}`);
    }
  }
  const raw = YAML.parse(
    readFileSync(join(seedDir, "consumption-refund-claims.yaml.example"), "utf-8"),
  );
  consumptionRefundClaimsFileSchema.parse(raw);
}
