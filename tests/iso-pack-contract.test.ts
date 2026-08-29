import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_IDS } from "../schemas/generated/agent-ids.js";
import {
  getControlMapPath,
  loadControlMapForStandard,
  loadCoreBindingsForStandard,
  loadCoreControls,
} from "../src/lib/control-framework.js";
import { listIsoCatalogEntries } from "../src/lib/iso-catalog.js";
import { packTemplatesDir, tenantEvidenceRel } from "../src/lib/iso-templates.js";
import { getIsoStandardIndexPath } from "../src/lib/standards.js";

const AVAILABLE = listIsoCatalogEntries().filter((e) => e.status === "available");
const WORKS = new Set(loadCoreControls().map((c) => c.work));
const AGENTS = new Set<string>(AGENT_IDS);

describe.each(AVAILABLE.map((e) => [e.id, e] as const))("ISO pack contract — %s", (id, entry) => {
  it("has a folder, an index and a control map", () => {
    expect(existsSync(getControlMapPath(id))).toBe(true);
    expect(existsSync(getIsoStandardIndexPath(id))).toBe(true);
  });

  it("declares controls or core bindings", () => {
    const controls = loadControlMapForStandard(id);
    const bindings = loadCoreBindingsForStandard(id);
    expect(controls.length + bindings.length).toBeGreaterThan(0);
  });

  it("every control references its own standard and a real agent", () => {
    for (const ctrl of loadControlMapForStandard(id)) {
      expect(ctrl.iso_refs.some((r) => r.standard === id), `${ctrl.id}`).toBe(true);
      expect(AGENTS.has(ctrl.primary_agent), `${ctrl.id} primary_agent`).toBe(true);
      for (const agent of ctrl.secondary_agents ?? []) {
        expect(AGENTS.has(agent), `${ctrl.id} secondary_agent ${agent}`).toBe(true);
      }
    }
  });

  it("control ids use dot clause notation", () => {
    for (const ctrl of loadControlMapForStandard(id)) {
      if (ctrl.id.startsWith("CTL-CORE-")) continue;
      const suffix = ctrl.id.replace(/^CTL-\d{4,5}-/, "");
      expect(suffix, `${ctrl.id} must not use hyphenated clauses`).not.toMatch(/^\d+-\d/);
    }
  });

  it("core bindings use known work types", () => {
    for (const b of loadCoreBindingsForStandard(id)) {
      expect(WORKS.has(b.work), `${id} binds unknown work ${b.work}`).toBe(true);
    }
  });

  it("HLS standards bind the shared works, guidance does not", () => {
    const bindings = loadCoreBindingsForStandard(id);
    if (entry.kind === "guidance") {
      expect(bindings).toHaveLength(0);
      return;
    }
    const works = new Set(bindings.map((b) => b.work));
    expect(works.has("internal_audit"), `${id} must bind internal_audit`).toBe(true);
    expect(works.has("scope"), `${id} must bind scope`).toBe(true);
    expect(works.has("policy"), `${id} must bind policy`).toBe(true);
  });
});

/**
 * A pack that names an evidence file under its own compliance folder should also
 * ship the blank form, otherwise enabling the standard reports nonconformities
 * the tenant has no way to clear. Packs still owing forms say so in the catalog
 * (`evidence_forms: partial`), so the debt is visible rather than silent.
 */
function evidenceFormsDeclared(id: string): string[] {
  const prefix = `${tenantEvidenceRel(id)}/`;
  const declared = new Set<string>();
  const collect = (paths: string[]): void => {
    for (const p of paths) {
      if (!p.startsWith(prefix) || p.includes("*") || p.endsWith("/")) continue;
      const rest = p.slice(prefix.length);
      // Only direct files are pack forms; nested folders are tenant-generated.
      if (!rest.includes("/")) declared.add(rest);
    }
  };
  for (const ctrl of loadControlMapForStandard(id)) collect(ctrl.evidence_paths);
  for (const b of loadCoreBindingsForStandard(id)) collect(b.evidence_paths);
  return [...declared];
}

function missingEvidenceForms(id: string): string[] {
  return evidenceFormsDeclared(id).filter(
    (f) => !existsSync(join(packTemplatesDir(id), f)),
  );
}

describe.each(AVAILABLE.map((e) => [e.id, e] as const))(
  "ISO pack evidence forms — %s",
  (id, entry) => {
    it("matches the completeness it claims in the catalog", () => {
      const missing = missingEvidenceForms(id);
      if (entry.evidence_forms === "complete") {
        expect(missing, `${id}: complete と宣言しているが様式がない`).toEqual([]);
      } else {
        expect(
          missing.length,
          `${id}: 様式は揃っている。catalog.yaml を evidence_forms: complete にする`,
        ).toBeGreaterThan(0);
      }
    });
  },
);

describe("ISO pack control priority", () => {
  it("every available pack control declares an establishment order", () => {
    for (const entry of AVAILABLE) {
      for (const ctrl of loadControlMapForStandard(entry.id)) {
        expect(["P1", "P2", "P3"], `${ctrl.id}`).toContain(ctrl.priority);
      }
    }
  });

  it("ISO-21401 puts guest safety and hygiene first", () => {
    const byId = new Map(loadControlMapForStandard("ISO-21401").map((c) => [c.id, c]));
    expect(byId.get("CTL-21401-guest-safety")?.priority).toBe("P1");
    expect(byId.get("CTL-21401-hygiene")?.priority).toBe("P1");
    expect(byId.get("CTL-21401-eco-local")?.priority).toBe("P3");
  });

  it("ISO-21401 covers the environmental, socio-cultural and economic dimensions", () => {
    const ids = loadControlMapForStandard("ISO-21401").map((c) => c.id);
    expect(ids.some((i) => i.startsWith("CTL-21401-env-"))).toBe(true);
    expect(ids.some((i) => i.startsWith("CTL-21401-soc-"))).toBe(true);
    expect(ids.some((i) => i.startsWith("CTL-21401-eco-"))).toBe(true);
  });
});
