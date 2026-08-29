import { describe, expect, it } from "vitest";
import {
  loadControlMapForStandard,
  loadCoreBindingsForStandard,
  loadCoreControls,
  loadCoreProfile,
} from "../src/lib/control-framework.js";
import { listAvailableIsoIds, listIsoCatalogEntries } from "../src/lib/iso-catalog.js";
import { listIsoStandardIds } from "../src/lib/standards.js";

/** Legacy id kept on purpose in the ISO-27001 pack — see that map's comment. */
const LEGACY_CORE_PREFIXED_IDS = new Set(["CTL-CORE-privacy"]);

describe("ISO core module", () => {
  const core = loadCoreControls();

  it("every core control is CTL-CORE-* with a unique work key", () => {
    expect(core.length).toBeGreaterThan(0);
    for (const c of core) {
      expect(c.id).toMatch(/^CTL-CORE-/);
    }
    const works = core.map((c) => c.work);
    expect(new Set(works).size).toBe(works.length);
  });

  it("superseded ids are gone from every pack", () => {
    const superseded = new Set(core.flatMap((c) => c.supersedes));
    expect(superseded.size).toBeGreaterThan(20);
    for (const iso of listAvailableIsoIds()) {
      for (const ctrl of loadControlMapForStandard(iso)) {
        expect(superseded.has(ctrl.id), `${iso} still defines ${ctrl.id}`).toBe(false);
      }
    }
  });

  it("guidance_refs point at catalogued guidance standards", () => {
    const guidance = new Set(
      listIsoCatalogEntries()
        .filter((e) => e.kind === "guidance")
        .map((e) => e.id)
    );
    const refs = core.flatMap((c) => c.guidance_refs);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(guidance.has(ref.standard), `${ref.standard} is not catalogued as guidance`).toBe(true);
    }
  });

  it("core pack is not exposed as an enable-able standard", () => {
    expect(listIsoStandardIds()).not.toContain("core");
  });

  it("profiles only reference known works", () => {
    const works = new Set(core.map((c) => c.work));
    for (const name of ["hls_full", "qms_legacy"]) {
      const profile = loadCoreProfile(name);
      expect(profile.length, `${name} is empty`).toBeGreaterThan(0);
      for (const b of profile) {
        expect(works.has(b.work), `${name} binds unknown work ${b.work}`).toBe(true);
      }
    }
  });

  it("CTL-CORE-* ids appear only in the core pack", () => {
    for (const iso of listAvailableIsoIds()) {
      for (const ctrl of loadControlMapForStandard(iso)) {
        if (!ctrl.id.startsWith("CTL-CORE-")) continue;
        expect(LEGACY_CORE_PREFIXED_IDS.has(ctrl.id), `${iso} defines ${ctrl.id}`).toBe(true);
      }
    }
  });

  it("13485 binds the same works at pre-HLS clause numbers", () => {
    const byWork = new Map(
      loadCoreBindingsForStandard("ISO-13485").map((b) => [b.work, b.clause])
    );
    expect(byWork.get("internal_audit")).toBe("8.2.4");
    expect(byWork.get("management_review")).toBe("5.6");
    expect(byWork.get("competence")).toBe("6.2");
    expect(byWork.get("documented_information")).toBe("4.2.4");
  });
});
