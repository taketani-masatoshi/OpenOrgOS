import { describe, expect, it } from "vitest";
import {
  listIsoStandardIds,
  getIsoStandardIndexPath,
  STEWARD_ISO_DIR,
} from "../src/lib/standards.js";
import { existsSync } from "node:fs";

describe("steward/standards/iso", () => {
  it("lists ISO standard folders", () => {
    const ids = listIsoStandardIds();
    expect(ids).toEqual([
      "ISO-13485",
      "ISO-14001",
      "ISO-20000",
      "ISO-21401",
      "ISO-22000",
      "ISO-22301",
      "ISO-27001",
      "ISO-37000",
      "ISO-37001",
      "ISO-45001",
      "ISO-50001",
      "ISO-9001",
    ]);
  });

  it("has index doc per standard", () => {
    for (const id of listIsoStandardIds()) {
      expect(existsSync(getIsoStandardIndexPath(id))).toBe(true);
    }
  });

  it("iso dir exists", () => {
    expect(existsSync(STEWARD_ISO_DIR)).toBe(true);
  });
});
