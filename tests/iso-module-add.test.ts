/**
 * Adding one ISO standard must be enough: the shared management-system controls
 * have to show up on their own, carrying that standard's clause numbers.
 * Parameterized over every `available` standard so a new pack cannot regress it.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  computeControlGaps,
  initTenantControlsFile,
  listEffectiveControls,
  loadControlMaps,
  loadCoreBindingsForStandard,
} from "../src/lib/control-framework.js";
import { evaluateIsoInternalAudit } from "../src/lib/iso-internal-audit.js";
import { listIsoCatalogEntries } from "../src/lib/iso-catalog.js";
import { getTenantsDir, setTenantId } from "../src/lib/tenant.js";

const TENANT_ID = `iso-module-add-${process.pid}`;
const tenantDir = join(getTenantsDir(), TENANT_ID);
const AVAILABLE = listIsoCatalogEntries().filter((e) => e.status === "available");
/** Legacy id living in the ISO-27001 pack, not a shared core work. */
const LEGACY_CORE_PREFIXED_IDS = new Set(["CTL-CORE-privacy"]);

function enableOnly(isoId: string): void {
  writeFileSync(
    join(tenantDir, "standards.yaml"),
    `version: "1"\niso:\n  - id: ${isoId}\n    enabled: true\n`,
    "utf-8"
  );
}

beforeAll(() => {
  mkdirSync(join(tenantDir, "data", "compliance"), { recursive: true });
  writeFileSync(
    join(tenantDir, "modules.yaml"),
    "modules:\n  - id: hospitality\n    agent: hospitality\n    enabled: false\n",
    "utf-8"
  );
  writeFileSync(
    join(tenantDir, "tenant.yaml"),
    `id: ${TENANT_ID}\nname: ISO module add fixture\nlifecycle: test\noperation_mode: development\njurisdiction: JP\n`,
    "utf-8"
  );
  setTenantId(TENANT_ID);
});

afterAll(() => {
  rmSync(tenantDir, { recursive: true, force: true });
});

describe.each(AVAILABLE.map((e) => [e.id, e] as const))(
  "enabling only %s",
  (isoId, entry) => {
    it("loads controls and seeds a tenant controls file", () => {
      enableOnly(isoId);
      setTenantId(TENANT_ID);

      const controls = loadControlMaps();
      expect(controls.length).toBeGreaterThan(0);

      const seeded = initTenantControlsFile({ dryRun: true });
      expect(seeded.count).toBe(controls.length);
    });

    it("core controls appear with this standard's own clauses", () => {
      enableOnly(isoId);
      setTenantId(TENANT_ID);

      const bindings = loadCoreBindingsForStandard(isoId);
      const controls = loadControlMaps();
      const coreControls = controls.filter(
        (c) => c.id.startsWith("CTL-CORE-") && !LEGACY_CORE_PREFIXED_IDS.has(c.id)
      );

      if (entry.kind === "guidance") {
        expect(bindings).toHaveLength(0);
        return;
      }

      const boundWorks = new Set(bindings.map((b) => b.work));
      expect(coreControls.length).toBe(boundWorks.size);

      for (const c of coreControls) {
        for (const ref of c.iso_refs) {
          expect(ref.standard).toBe(isoId);
          expect(ref.edition).toBe(entry.year);
        }
      }
      // No core control is emitted without a binding — no orphans.
      const clauses = new Set(bindings.map((b) => b.clause));
      for (const c of coreControls) {
        for (const ref of c.iso_refs) {
          expect(clauses.has(ref.clause)).toBe(true);
        }
      }
    });

    it("gap and audit evaluation stay total", () => {
      enableOnly(isoId);
      setTenantId(TENANT_ID);

      expect(() => computeControlGaps()).not.toThrow();
      expect(listEffectiveControls().every((c) => c.in_scope !== undefined)).toBe(true);

      const run = evaluateIsoInternalAudit();
      expect(run.summary.map_missing).toBe(0);
      expect(run.standards).toEqual([isoId]);
    });
  }
);
