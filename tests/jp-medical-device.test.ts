import { describe, expect, it, vi } from "vitest";
import { loadModuleManifest } from "../src/lib/modules.js";
import { listModuleCliBundles } from "../src/lib/module-cli.js";
import {
  runJpMedicalDeviceLedgerStatus,
  runJpMedicalDeviceObligations,
  runJpMedicalDeviceValidate,
} from "../steward/jurisdiction-packs/JP/modules/jp_medical_device/cli/lib.js";

describe("jp_medical_device module", () => {
  it("has production_ready manifest", () => {
    const manifest = loadModuleManifest("jp_medical_device");
    expect(manifest?.id).toBe("jp_medical_device");
    expect(listModuleCliBundles().map((b) => b.moduleId)).toContain("jp_medical_device");
  });

  it("validates mal tenant medical device data", () => {
    const prev = process.env.STEWARD_TENANT;
    process.env.STEWARD_TENANT = "mal";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpMedicalDeviceValidate();
    expect(spy).toHaveBeenCalledWith("✓ jp_medical_device — medical device QMS/GVP data OK");
    spy.mockRestore();
    process.env.STEWARD_TENANT = prev;
  });

  it("lists mah obligations", () => {
    const prev = process.env.STEWARD_TENANT;
    process.env.STEWARD_TENANT = "mal";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpMedicalDeviceObligations({ role: "mah" });
    expect(spy.mock.calls.some((c) => String(c[0]).includes("OBL-GVP"))).toBe(true);
    spy.mockRestore();
    process.env.STEWARD_TENANT = prev;
  });

  it("reports ledger status on mal", () => {
    const prev = process.env.STEWARD_TENANT;
    process.env.STEWARD_TENANT = "mal";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpMedicalDeviceLedgerStatus({});
    expect(spy.mock.calls.some((c) => String(c[0]).includes("台帳ステータス"))).toBe(true);
    spy.mockRestore();
    process.env.STEWARD_TENANT = prev;
  });
});
