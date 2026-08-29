import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listModuleCliBundles } from "../src/lib/module-cli.js";
import { loadModuleManifest } from "../src/lib/modules.js";
import {
  loadRoutingRegistry,
  matchRoutes,
  validateRoutingRegistry,
} from "../src/lib/routing.js";
import { validateSkillRegistryFiles } from "../src/lib/skill-registry.js";
import {
  buildHotpepperSearchUrl,
  buildTabelogSearchUrl,
  cancelVenueReservation,
  confirmVenueReservation,
  findVenueReservation,
  getVenueBookingAdapter,
  listVenueBookingAdapterIds,
  loadVenueCatalog,
  loadVenueProviders,
  reserveVenue,
  VENUE_BOOKING_CHANNEL,
} from "../src/lib/venue-booking/index.js";
import {
  cleanupSchedulingTenant,
  schedulingCase,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";
import { insertSchedulingCase } from "../src/lib/scheduling-coordination/store.js";

const TENANT = "vb-unit-test";

function seedVenueFiles(root: string): void {
  const ops = join(root, "data", "operations");
  mkdirSync(ops, { recursive: true });
  writeFileSync(
    join(ops, "venue-providers.yaml"),
    [
      "version: 1",
      "channel: venue_booking",
      "default_provider: hotpepper_deep_link",
      "providers:",
      "  - id: manual",
      "    name: Manual",
      "    base_url: https://www.google.com/",
      "    supports_api: false",
      "    supports_deep_link: true",
      "  - id: hotpepper_deep_link",
      "    name: Hotpepper",
      "    base_url: https://www.hotpepper.jp/",
      "    supports_api: false",
      "    supports_deep_link: true",
      "  - id: tabelog_deep_link",
      "    name: Tabelog",
      "    base_url: https://tabelog.com/",
      "    supports_api: false",
      "    supports_deep_link: true",
      "",
    ].join("\n")
  );
  writeFileSync(
    join(ops, "venue-catalog.yaml"),
    [
      "version: 1",
      "venues:",
      "  - id: VENUE-001",
      "    name: Test Tea House",
      "    area: Shinbashi",
      "    provider_id: hotpepper_deep_link",
      "    typical_budget_jpy: 10000",
      "",
    ].join("\n")
  );
  writeFileSync(
    join(ops, "venue-reservations.yaml"),
    "version: 1\nchannel: venue_booking\nreservations: []\n"
  );
}

describe("venue_booking channel isolation", () => {
  it("exports venue_booking channel constant (not wire)", () => {
    expect(VENUE_BOOKING_CHANNEL).toBe("venue_booking");
    expect(VENUE_BOOKING_CHANNEL).not.toBe("wire");
  });

  it("registers CLI bundle", () => {
    expect(listModuleCliBundles().map((b) => b.moduleId)).toContain("venue_booking");
  });

  it("has module manifest", () => {
    const manifest = loadModuleManifest("venue_booking");
    expect(manifest?.id).toBe("venue_booking");
  });

  it("registers skill and routing without registry errors", () => {
    expect(validateSkillRegistryFiles()).toEqual([]);
    expect(validateRoutingRegistry()).toEqual([]);
    const route = loadRoutingRegistry().routes.find((r) => r.id === "venue-booking");
    expect(route?.agent).toBe("operations");
    expect(route?.skill).toBe("venue_booking");
  });

  it("matches venue booking keywords", () => {
    const matches = matchRoutes({ text: "新橋で会食予約をお願い" });
    expect(matches.some((m) => m.route.id === "venue-booking")).toBe(true);
  });
});

describe("venue_booking adapters", () => {
  it("lists wired adapters and rejects hotpepper_api stub", () => {
    expect(listVenueBookingAdapterIds()).toEqual(
      expect.arrayContaining(["manual", "hotpepper_deep_link", "tabelog_deep_link"])
    );
    expect(() => getVenueBookingAdapter("hotpepper_api")).toThrow(/not wired/);
  });

  it("builds deep-link search URLs", () => {
    const req = {
      provider_id: "hotpepper_deep_link" as const,
      venue_name: "Test Tea House",
      area: "Shinbashi",
      party_size: 2,
      start_at: "2026-07-20T19:00",
      request_id: "req-url-1",
    };
    expect(buildHotpepperSearchUrl(req)).toContain("hotpepper.jp");
    expect(buildTabelogSearchUrl({ ...req, provider_id: "tabelog_deep_link" })).toContain(
      "tabelog.com"
    );
  });
});

describe("venue_booking reserve/confirm", () => {
  beforeEach(() => {
    const root = seedSchedulingTenant(TENANT);
    seedVenueFiles(root);
    insertSchedulingCase(schedulingCase("SCH-2026-801"));
  });

  afterEach(() => {
    cleanupSchedulingTenant(TENANT);
  });

  it("loads providers and catalog", () => {
    expect(loadVenueProviders()?.default_provider).toBe("hotpepper_deep_link");
    expect(loadVenueCatalog()?.venues[0]?.id).toBe("VENUE-001");
  });

  it("reserves with deep-link and is idempotent on request_id", async () => {
    const first = await reserveVenue({
      venue: "VENUE-001",
      schedulingCaseId: "SCH-2026-801",
      requestId: "idem-vb-1",
      startAt: "2026-07-20T19:00",
      partySize: 2,
    });
    expect(first.reservation.channel).toBe("venue_booking");
    expect(first.reservation.status).toBe("pending_manual");
    expect(first.deep_link_url ?? first.search_url).toBeTruthy();
    expect(first.reservation.scheduling_case_id).toBe("SCH-2026-801");

    const second = await reserveVenue({
      venue: "VENUE-001",
      requestId: "idem-vb-1",
      startAt: "2026-07-20T19:00",
    });
    expect(second.reservation.id).toBe(first.reservation.id);
    expect(second.message).toContain("idempotent");
  });

  it("confirms with allow-unapproved and cancels", async () => {
    const { reservation } = await reserveVenue({
      venueName: "Manual Spot",
      area: "Ginza",
      providerId: "manual",
      startAt: "2026-07-21T18:30",
      requestId: "idem-vb-2",
    });
    const confirmed = await confirmVenueReservation({
      id: reservation.id,
      externalRef: "MANUAL-99",
      allowUnapproved: true,
    });
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.external_ref).toBe("MANUAL-99");

    const cancelled = await cancelVenueReservation(reservation.id);
    expect(cancelled.status).toBe("cancelled");
    expect(findVenueReservation(reservation.id)?.status).toBe("cancelled");
  });

  it("rejects LIVE-MEASURE external_ref without allowMeasurementRef", async () => {
    const { reservation } = await reserveVenue({
      venueName: "Manual Spot",
      area: "Ginza",
      providerId: "manual",
      startAt: "2026-07-22T18:30",
      requestId: "idem-vb-measure",
    });
    await expect(
      confirmVenueReservation({
        id: reservation.id,
        externalRef: "LIVE-MEASURE-TEST",
        allowUnapproved: true,
      })
    ).rejects.toThrow(/計測|LIVE-MEASURE|measurement|プレースホルダ/i);
    const confirmed = await confirmVenueReservation({
      id: reservation.id,
      externalRef: "LIVE-MEASURE-TEST",
      allowUnapproved: true,
      allowMeasurementRef: true,
    });
    expect(confirmed.external_ref).toBe("LIVE-MEASURE-TEST");
  });

  it("rejects HP-PROOF / REH- without allowMeasurementRef", async () => {
    const { reservation } = await reserveVenue({
      venueName: "HP Spot",
      area: "Shinbashi",
      providerId: "hotpepper_deep_link",
      startAt: "2026-07-22T18:30",
      requestId: "idem-vb-hp-proof",
    });
    await expect(
      confirmVenueReservation({
        id: reservation.id,
        externalRef: "HP-PROOF-20260714-022",
        allowUnapproved: true,
      })
    ).rejects.toThrow(/プレースホルダ|measurement|HP-PROOF/i);
    await expect(
      confirmVenueReservation({
        id: reservation.id,
        externalRef: "REH-VR-DEMO",
        allowUnapproved: true,
      })
    ).rejects.toThrow(/プレースホルダ|measurement|REH/i);
  });

  it("rejects weak Hotpepper external_ref shape", async () => {
    const { reservation } = await reserveVenue({
      venueName: "HP Spot 2",
      area: "Ginza",
      providerId: "hotpepper_deep_link",
      startAt: "2026-07-22T19:00",
      requestId: "idem-vb-hp-shape",
    });
    await expect(
      confirmVenueReservation({
        id: reservation.id,
        externalRef: "abcdef",
        allowUnapproved: true,
      })
    ).rejects.toThrow(/6文字|数字/i);
    const confirmed = await confirmVenueReservation({
      id: reservation.id,
      externalRef: "HP12345678",
      allowUnapproved: true,
    });
    expect(confirmed.external_ref).toBe("HP12345678");
  });

  it("rejects confirm without approval gate", async () => {
    const { reservation } = await reserveVenue({
      venue: "VENUE-001",
      startAt: "2026-07-22T19:00",
      requestId: "idem-vb-3",
    });
    await expect(
      confirmVenueReservation({ id: reservation.id, externalRef: "HP12345678" })
    ).rejects.toThrow(/approval-id/);
  });
});
