import { existsSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { readFileSync } from "node:fs";

export function validateModuleSeeds(seedDir: string): void {
  for (const name of [
    "payroll-rates-2026.yaml.example",
    "payroll-summary.yaml.example",
  ]) {
    if (!existsSync(join(seedDir, name))) {
      throw new Error(`jp_payroll seed missing: ${name}`);
    }
  }
  const rates = YAML.parse(
    readFileSync(join(seedDir, "payroll-rates-2026.yaml.example"), "utf-8"),
  ) as { social_insurance?: { standard_remuneration_grades?: unknown[] } };
  if (!rates.social_insurance?.standard_remuneration_grades?.length) {
    throw new Error("jp_payroll rates missing standard_remuneration_grades");
  }
}
