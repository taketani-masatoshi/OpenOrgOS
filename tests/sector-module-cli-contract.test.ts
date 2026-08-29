// @catalog-coverage: partial
// @catalog-ids: clinic, education, event_space, construction, logistics, retail_store, restaurant, jp_carbon_neutral_2050, jp_privacy_policy, jp_women_empowerment

import { describe, expect, it } from "vitest";
import { loadModuleManifest } from "../src/lib/modules.js";
import {
  describeModuleCliRegistrations,
  listModuleCliBundles,
} from "../src/lib/module-cli.js";

const SECTOR_MODULE_IDS = [
  "clinic",
  "education",
  "event_space",
  "construction",
  "logistics",
  "retail_store",
  "restaurant",
  "jp_carbon_neutral_2050",
  "jp_privacy_policy",
  "jp_women_empowerment",
] as const;

describe("sector / JP declaration module CLI contract", () => {
  it("registers CLI bundles for previously unwired sector modules", () => {
    const ids = listModuleCliBundles().map((bundle) => bundle.moduleId);
    for (const moduleId of SECTOR_MODULE_IDS) {
      expect(ids, moduleId).toContain(moduleId);
    }
  });

  it("manifest cli_commands match registered subcommands", () => {
    const registrations = describeModuleCliRegistrations();
    for (const moduleId of SECTOR_MODULE_IDS) {
      const manifest = loadModuleManifest(moduleId);
      expect(manifest?.cli_commands?.length, `${moduleId} cli_commands`).toBeGreaterThan(0);
      const registration = registrations.get(moduleId);
      expect(registration, `${moduleId} CLI root`).toBeTruthy();
      for (const name of manifest!.cli_commands ?? []) {
        expect(registration!.subcommands.includes(name), `${moduleId}.${name}`).toBe(true);
      }
    }
  });
});
