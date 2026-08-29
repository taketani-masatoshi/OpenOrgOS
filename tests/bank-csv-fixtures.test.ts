import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { listBankCsvPresets, resolveBankCsvPreset } from "../src/lib/finance/bank-csv-presets.js";

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/bank-csv");

describe("bank csv commercial fixtures", () => {
  it("ships major-bank UTF-8 and SJIS samples", () => {
    const files = readdirSync(FIXTURE_DIR);
    for (const name of [
      "mizuho_utf8.csv",
      "mizuho_sjis.csv",
      "mufg_utf8.csv",
      "mufg_sjis.csv",
      "smbc_utf8.csv",
      "smbc_sjis.csv",
      "yucho_utf8.csv",
      "rakuten_utf8.csv",
      "bad_header.csv",
    ]) {
      expect(files).toContain(name);
    }
  });

  it("presets cover fixture banks", () => {
    const ids = listBankCsvPresets().map((row) => row.id);
    for (const id of ["mizuho", "mufg", "smbc", "yucho", "rakuten", "generic"]) {
      expect(ids).toContain(id);
      expect(resolveBankCsvPreset(id)?.sample_header.length).toBeGreaterThan(0);
    }
  });

  it("UTF-8 fixtures expose recognizable headers", () => {
    const mizuho = readFileSync(join(FIXTURE_DIR, "mizuho_utf8.csv"), "utf-8");
    expect(mizuho.split("\n")[0]).toMatch(/取引日|日付/);
    const sjis = readFileSync(join(FIXTURE_DIR, "mizuho_sjis.csv"));
    expect(sjis.length).toBeGreaterThan(10);
  });
});
