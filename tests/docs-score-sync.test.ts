import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { globFilesSync } from "../src/lib/glob-files.js";

const root = join(import.meta.dirname, "..");

describe("docs score sync", () => {
  it("framework-assessment documents a test count near vitest total", () => {
    const text = readFileSync(join(root, "docs", "framework-assessment.md"), "utf-8");
    const match = text.match(/\*\*(\d+)\+?\s+tests\*\*/);
    expect(match, "framework-assessment should mention **NNN tests**").toBeTruthy();
    const docCount = Number(match![1]);
    let actual = 0;
    for (const rel of globFilesSync("tests/**/*.test.ts", { cwd: root })) {
      const body = readFileSync(join(root, rel), "utf-8");
      actual += (body.match(/\b(it|test)\s*\(/g) ?? []).length;
    }
    expect(docCount).toBeGreaterThanOrEqual(430);
    expect(Math.abs(docCount - actual)).toBeLessThanOrEqual(35);
  });
});
