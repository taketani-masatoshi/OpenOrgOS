import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  CANONICAL_WRITE_BASELINE,
  canonicalWriteBaselineKey,
} from "../src/lib/org/fs-guard/canonical-write-baseline.js";

describe("canonical write baseline", () => {
  it("matches live scan (no drift)", () => {
    const out = execFileSync(
      "node",
      ["--import", "tsx", join(process.cwd(), "scripts/check-canonical-writes.ts")],
      { encoding: "utf-8", cwd: process.cwd() }
    );
    expect(out).toMatch(/^OK:/);
  });

  it("has unique baseline keys", () => {
    const keys = CANONICAL_WRITE_BASELINE.map(canonicalWriteBaselineKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
