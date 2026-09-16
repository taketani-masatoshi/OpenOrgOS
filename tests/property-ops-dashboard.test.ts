import { describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { buildPropertyOpsDashboard } from "../src/lib/property-ops/build-dashboard.js";
import {
  operatorShellTabFromRoute,
  pathActive,
  spaPathFromHref,
} from "../apps/steward-chat/src/console-routing.js";

describe("buildPropertyOpsDashboard", () => {
  it("returns property cards for mal without guest PII fields", () => {
    setTenantId("mal");
    const dash = buildPropertyOpsDashboard();
    expect(dash.ok).toBe(true);
    expect(dash.tenant).toBe("mal");
    expect(dash.properties.length).toBeGreaterThanOrEqual(1);
    const ids = dash.properties.map((p) => p.property_id);
    expect(ids).toEqual(expect.arrayContaining(["PROP-001", "PROP-002"]));

    for (const card of dash.properties) {
      expect(card.name.length).toBeGreaterThan(0);
      expect(Array.isArray(card.due)).toBe(true);
      expect(Array.isArray(card.insurance)).toBe(true);
      expect(Array.isArray(card.permits)).toBe(true);
      expect(Array.isArray(card.bulletins)).toBe(true);
      expect(card).not.toHaveProperty("secrets");
      for (const due of card.due) {
        expect(due).not.toHaveProperty("guest_name");
        expect(due).toHaveProperty("href");
      }
    }

    const kamezawa = dash.properties.find((p) => p.property_id === "PROP-002");
    expect(kamezawa?.type).toBe("hotel");
    expect(kamezawa?.register).toBeDefined();
    expect(kamezawa?.register).not.toHaveProperty("rows");

    const bancho = dash.properties.find((p) => p.property_id === "PROP-001");
    expect(bancho?.type).toBe("rental");
    expect(bancho?.register).toBeUndefined();
    expect(bancho?.finance.monthly_rent ?? bancho?.finance.monthly_revenue).toBeTruthy();

    // Tax / register / nights_cap due only on default hospitality property.
    const banchoTenantDue = bancho?.due.filter((d) =>
      ["tax", "register", "nights_cap"].includes(d.kind),
    );
    expect(banchoTenantDue ?? []).toHaveLength(0);
  });

  it("does not fall back to all insurance policies when unmatched", () => {
    setTenantId("mal");
    const dash = buildPropertyOpsDashboard();
    for (const card of dash.properties) {
      for (const pol of card.insurance) {
        const blob = `${pol.id} ${pol.name}`.toLowerCase();
        const hintsProperty =
          blob.includes(card.property_id.toLowerCase()) ||
          blob.includes(card.name.slice(0, 2).toLowerCase()) ||
          (card.type === "hotel" && /旅館|宿|hotel|kamezawa|亀沢/.test(blob)) ||
          (card.type === "rental" && /賃貸|番町|bancho|rent/.test(blob));
        expect(hintsProperty).toBe(true);
      }
    }
  });

  it("filters by property_id", () => {
    setTenantId("mal");
    const dash = buildPropertyOpsDashboard({ propertyId: "PROP-002" });
    expect(dash.properties).toHaveLength(1);
    expect(dash.properties[0]?.property_id).toBe("PROP-002");
  });
});

describe("console-routing properties", () => {
  it("resolves /properties/", () => {
    expect(pathActive("/properties")).toBe("properties");
    expect(pathActive("/properties/")).toBe("properties");
    expect(operatorShellTabFromRoute("properties")).toBe("executive");
    expect(spaPathFromHref("/properties/", "http://localhost")).toBe(
      "/properties/",
    );
  });
});
