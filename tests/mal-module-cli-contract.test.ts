// @catalog-coverage: partial
// @catalog-ids: hospitality, travel_booking, customer_success, investor_relations, rental, jp_corporate_registration, jp_medical_device, jp_bank_corporate

import { describe, expect, it } from "vitest";
import { loadModuleManifest } from "../src/lib/modules.js";
import {
  describeModuleCliRegistrations,
  listModuleCliBundles,
} from "../src/lib/module-cli.js";

const MAL_MODULE_IDS = [
  "hospitality",
  "travel_booking",
  "customer_success",
  "investor_relations",
  "rental",
  "jp_corporate_registration",
  "jp_medical_device",
  "jp_bank_corporate",
] as const;

describe("mal module CLI contract", () => {
  it("registers CLI bundles for all mal-enabled modules", () => {
    const ids = listModuleCliBundles().map((b) => b.moduleId);
    for (const moduleId of MAL_MODULE_IDS) {
      expect(ids, moduleId).toContain(moduleId);
    }
  });

  it("manifest cli_commands match registered subcommands", () => {
    const registrations = describeModuleCliRegistrations();

    for (const moduleId of MAL_MODULE_IDS) {
      const manifest = loadModuleManifest(moduleId);
      expect(manifest?.cli_commands?.length, `${moduleId} cli_commands`).toBeGreaterThan(0);

      const registration = registrations.get(moduleId);
      expect(registration, `${moduleId} CLI root`).toBeTruthy();
      expect(registration!.rootPath.length, `${moduleId} root path`).toBeGreaterThan(0);

      for (const name of manifest!.cli_commands ?? []) {
        expect(registration!.subcommands.includes(name), `${moduleId}.${name}`).toBe(true);
      }
    }
  });

  it("every declared cli_commands entry resolves for all bundled modules", () => {
    const registrations = describeModuleCliRegistrations();

    for (const registration of registrations.values()) {
      const declared = loadModuleManifest(registration.moduleId)?.cli_commands ?? [];
      const missing = declared.filter((name) => !registration.subcommands.includes(name));
      expect(missing, `${registration.moduleId} undeclared commands`).toEqual([]);
    }
  });
});
