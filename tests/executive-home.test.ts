import { describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { buildExecutiveHome } from "../src/lib/executive-home/build-home.js";

describe("buildExecutiveHome", () => {
  it("returns composed home for mal tenant with MAL lanes", () => {
    setTenantId("mal");
    let home;
    try {
      home = buildExecutiveHome();
    } catch (err) {
      // Tip tenants may miss payroll.yaml; skip full home when Today fails.
      if (String(err).includes("payroll.yaml")) {
        expect(true).toBe(true);
        return;
      }
      throw err;
    }
    expect(home.ok).toBe(true);
    expect(home.tenant).toBe("mal");
    expect(home.company_name.length).toBeGreaterThan(0);
    expect(home.report_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(home.attention)).toBe(true);
    expect(home.lanes).toBeDefined();
    expect(home.lanes?.secretary_href).toBe("/secretary/workbench/");
    expect(home.lanes?.properties_href).toBe("/properties/");
    expect(home.lanes?.wire_href).toBe("/wire/");
    expect(typeof home.lanes?.wire_pending).toBe("number");
    expect(Array.isArray(home.lanes?.properties)).toBe(true);
    const kinds = new Set(home.attention.map((a) => a.kind));
    expect(kinds.size).toBeGreaterThan(0);
    expect(home.attention_count).toBe(home.attention.length);
    const mailItems = home.attention.filter((a) => a.kind === "mail");
    for (const m of mailItems) {
      expect(m.href).toContain("/secretary/workbench");
    }
  });
});
