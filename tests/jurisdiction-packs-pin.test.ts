import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import {
  parsePackPinSource,
  runJurisdictionPacksPin,
} from "../src/commands/locale-jurisdiction.js";
import { JURISDICTION_PACKS_LOCK_PATH } from "../src/lib/jurisdiction.js";

describe("jurisdiction packs pin (ORG-J6-5)", () => {
  it("parses github source with version tag", () => {
    const parsed = parsePackPinSource("github:steward-os/jurisdiction-jp@1.0.0");
    expect(parsed.source).toBe("github:steward-os/jurisdiction-jp");
    expect(parsed.version).toBe("1.0.0");
  });

  it("dry-run pin writes nothing", () => {
    const before = readFileSync(JURISDICTION_PACKS_LOCK_PATH, "utf-8");
    runJurisdictionPacksPin("JP", "github:steward-os/jurisdiction-jp@9.9.9", { dryRun: true });
    expect(readFileSync(JURISDICTION_PACKS_LOCK_PATH, "utf-8")).toBe(before);
  });

  it("pin updates packs.lock.yaml and can revert to bundled", () => {
    const before = YAML.parse(readFileSync(JURISDICTION_PACKS_LOCK_PATH, "utf-8"));
    try {
      runJurisdictionPacksPin("JP", "github:steward-os/jurisdiction-jp@1.0.0");
      const after = YAML.parse(readFileSync(JURISDICTION_PACKS_LOCK_PATH, "utf-8"));
      expect(after.packs.JP.source).toBe("github:steward-os/jurisdiction-jp");
      expect(after.packs.JP.version).toBe("1.0.0");
      runJurisdictionPacksPin("JP", "bundled");
      const reverted = YAML.parse(readFileSync(JURISDICTION_PACKS_LOCK_PATH, "utf-8"));
      expect(reverted.packs.JP.source).toBe("bundled");
    } finally {
      writeFileSync(JURISDICTION_PACKS_LOCK_PATH, YAML.stringify(before));
    }
  });
});
