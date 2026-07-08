import { describe, it, expect, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  loadRoutingRegistry,
  matchRoutes,
  pickBestRoute,
  validateRoutingRegistry,
} from "../src/lib/routing.js";
import { loadSkillRegistry, validateSkillRegistryFiles } from "../src/lib/skill-registry.js";
import {
  buildRakutenSearchUrl,
  checkReg008Compliance,
  computeNights,
  formatIntakeReport,
  generateTravelDraftMarkdown,
  loadTravelPortals,
  validateTravelIntake,
  writeTravelDraft,
} from "../src/lib/travel-booking.js";
import { loadModuleManifest } from "../src/lib/modules.js";
import type { TravelBookingRequest } from "../schemas/travel-booking.js";

describe("travel_booking skill registry", () => {
  it("registers travel_booking as cursor-only Operations skill", () => {
    const skills = loadSkillRegistry();
    const skill = skills.find((s) => s.id === "travel_booking");
    expect(skill).toBeDefined();
    expect(skill?.runtime).toBe("cursor-only");
    expect(skill?.agent).toBe("Operations");
    expect(validateSkillRegistryFiles()).toEqual([]);
  });
});

describe("travel_booking routing", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("validates routing registry includes travel-booking route", () => {
    expect(validateRoutingRegistry()).toEqual([]);
    const registry = loadRoutingRegistry();
    const route = registry.routes.find((r) => r.id === "travel-booking");
    expect(route).toBeDefined();
    expect(route?.agent).toBe("operations");
    expect(route?.skill).toBe("travel_booking");
  });

  it("matches travel booking by keyword", () => {
    const matches = matchRoutes({ text: "来週の大阪出張のホテル予約をお願い" });
    expect(matches.some((m) => m.route.id === "travel-booking")).toBe(true);
  });

  it("picks travel-booking for 旅行手配 keyword", () => {
    const best = pickBestRoute({ text: "楽天トラベルで旅行手配して" });
    expect(best?.route.id).toBe("travel-booking");
    expect(best?.route.agent).toBe("operations");
  });
});

describe("travel_booking module", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("has module manifest and seeds", () => {
    const manifest = loadModuleManifest("travel_booking");
    expect(manifest?.id).toBe("travel_booking");
    expect(manifest?.optional_regulations).toContain("REG-008");
  });

  it("loads travel portals from tenant example", () => {
    const file = loadTravelPortals();
    expect(file?.default_portal).toBe("rakuten-travel");
    expect(file?.portals.some((p) => p.id === "rakuten-travel")).toBe(true);
  });
});

describe("travel_booking intake", () => {
  const complete: Partial<TravelBookingRequest> = {
    portal_id: "rakuten-travel",
    trip_type: "hotel",
    destination: "大阪",
    destination_area: "新大阪駅周辺",
    check_in: "2026-06-23",
    check_out: "2026-06-24",
    guests: 1,
    budget_max: 15000,
  };

  it("rejects incomplete intake", () => {
    const result = validateTravelIntake({ destination: "大阪" });
    expect(result.ok).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(formatIntakeReport(result)).toContain("browser 禁止");
  });

  it("accepts complete intake", () => {
    const result = validateTravelIntake(complete);
    expect(result.ok).toBe(true);
    expect(result.request?.check_in).toBe("2026-06-23");
    expect(computeNights("2026-06-23", "2026-06-24")).toBe(1);
  });

  it("checks REG-008 lodging limit", () => {
    const ok = checkReg008Compliance({ role: "executive", budgetMax: 12000 });
    expect(ok.lodgingOk).toBe(true);
    const over = checkReg008Compliance({ role: "executive", budgetMax: 16000 });
    expect(over.needsApproval).toBe(true);
  });

  it("generates draft markdown skeleton", () => {
    const request = validateTravelIntake(complete).request!;
    const md = generateTravelDraftMarkdown(request, { intakeDate: "2026-06-22" });
    expect(md).toContain("REG-008");
    expect(md).toContain("新大阪駅周辺");
    expect(md).toContain("1 泊");
  });

  it("builds rakuten search URL", () => {
    const url = buildRakutenSearchUrl({
      checkIn: "2026-06-23",
      checkOut: "2026-06-24",
      guests: 1,
      budgetMax: 15000,
    });
    expect(url).toContain("searchVacant");
    expect(url).toContain("f_kin=15000");
  });

  it("writeTravelDraft dry-run does not require write", () => {
    const request = validateTravelIntake(complete).request!;
    const { written, path } = writeTravelDraft(request, { dryRun: true, intakeDate: "2026-06-22" });
    expect(written).toBe(false);
    expect(path).toContain("travel-drafts");
  });
});
