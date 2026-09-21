import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  yearEndDeclarationSchema,
  type YearEndDeclaration,
} from "../../../schemas/finance/year-end.js";
import { getDataDir } from "../utils.js";

export function yearEndDeclarationPath(fiscalYear: string): string {
  return join(getDataDir(), "finance", `year-end.${fiscalYear}.yaml`);
}

export function readYearEndDeclaration(
  fiscalYear: string,
): { ok: true; value: YearEndDeclaration } | { ok: false; errors: string[] } {
  const path = yearEndDeclarationPath(fiscalYear);
  if (!existsSync(path)) {
    return { ok: false, errors: ["year-end declaration missing"] };
  }
  let raw: unknown;
  try {
    raw = YAML.parse(readFileSync(path, "utf-8"));
  } catch {
    return { ok: false, errors: ["year-end declaration invalid"] };
  }
  const parsed = yearEndDeclarationSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: ["year-end declaration invalid"] };
  }
  if (parsed.data.fiscal_year !== fiscalYear) {
    return { ok: false, errors: ["year-end fiscal year mismatch"] };
  }
  return { ok: true, value: parsed.data };
}
