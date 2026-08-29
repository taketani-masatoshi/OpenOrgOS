import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  cleanupSchedulingTenant,
  seedSchedulingTenant,
} from "./helpers/scheduling-fixture.js";
import { proposeExecutiveSlots } from "../src/lib/scheduling-coordination/slots.js";
import { schedulingCaseLooksLikeMeal } from "../src/lib/scheduling-coordination/draft-text.js";
import {
  formatVenueSuggestionLines,
  suggestVenuesForParties,
} from "../src/lib/venue-booking/suggest.js";
import { getDataDir } from "../src/lib/utils.js";

describe("venue suggest + evening slots", () => {
  beforeEach(() => {
    seedSchedulingTenant("venue-suggest");
  });
  afterEach(() => {
    cleanupSchedulingTenant("venue-suggest");
  });

  it("ranks nearer cluster venues higher for shared office stations", () => {
    const ops = join(getDataDir(), "operations");
    mkdirSync(ops, { recursive: true });
    writeFileSync(
      join(ops, "party-locations.yaml"),
      `version: 1
parties:
  - id: LOC-PARTY-mal-office
    party_kind: self_company
    role: office
    station: 麹町
    area: 二番町
    weight_day: 1
    weight_evening: 0.7
  - id: LOC-PARTY-peer-office
    party_kind: counterparty_org
    role: office
    station: 麹町
    email_domains: [southwood.co.jp]
    weight_day: 1
    weight_evening: 0.7
`
    );
    writeFileSync(
      join(ops, "venue-catalog.yaml"),
      `version: 1
venues:
  - id: VENUE-001
    name: Near Marunouchi
    area: 丸の内
    station: 東京
    walking_minutes_from_station: 5
    provider_id: manual
  - id: VENUE-002
    name: Far Shirokane
    area: 白金
    station: 白金高輪
    walking_minutes_from_station: 8
    provider_id: manual
  - id: VENUE-003
    name: Mid Shimbashi
    area: 新橋
    station: 新橋
    walking_minutes_from_station: 5
    provider_id: manual
`
    );

    const result = suggestVenuesForParties({
      timing: "evening",
      limit: 3,
      caseRow: {
        id: "SCH-2099-001",
        title: "契約締結祝い",
        purpose: "契約締結祝い",
        meeting_format: "in_person",
        participants: [
          {
            id: "PART-001",
            name: "相手",
            email: "peer@southwood.co.jp",
            role: "external",
            response: "pending",
          },
        ],
      } as never,
    });

    expect(result.suggestions[0]?.venue_id).toBe("VENUE-001");
    expect(result.suggestions[0]!.score).toBeLessThanOrEqual(result.suggestions[1]!.score);
    expect(result.suggestions.map((s) => s.venue_id).indexOf("VENUE-001")).toBe(0);
    expect(result.suggestions.map((s) => s.venue_id).indexOf("VENUE-002")).toBeGreaterThan(
      result.suggestions.map((s) => s.venue_id).indexOf("VENUE-003")
    );
    const lines = formatVenueSuggestionLines(result.suggestions);
    expect(lines.firstPick).toContain("Near Marunouchi");
  });

  it("uses evening hours for meal-like cases", () => {
    expect(
      schedulingCaseLooksLikeMeal({
        title: "契約締結祝い",
        purpose: "契約締結祝い",
        meeting_format: "in_person",
      })
    ).toBe(true);
    const slots = proposeExecutiveSlots({
      from: "2026-07-15",
      to: "2026-07-17",
      count: 3,
      timePreference: "evening",
    });
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      const hour = Number(slot.start.slice(11, 13));
      expect(hour).toBeGreaterThanOrEqual(18);
    }
  });
});

describe("quality note kinds", () => {
  beforeEach(() => {
    seedSchedulingTenant("quality-note-kinds");
  });
  afterEach(() => {
    cleanupSchedulingTenant("quality-note-kinds");
  });

  it("observation does not increment tone corrections", async () => {
    const { upsertSchedulingCase } = await import("../src/lib/scheduling-coordination/store.js");
    const {
      recordSecretaryQualityObservation,
      recordSecretaryToneCorrection,
      secretaryQualityScore,
    } = await import("../src/lib/scheduling-coordination/quality-signals.js");
    const { schedulingCaseSchema } = await import("../schemas/executive/scheduling-cases.js");
    const now = new Date().toISOString();
    upsertSchedulingCase(
      schedulingCaseSchema.parse({
        id: "SCH-2099-010",
        title: "t",
        status: "proposing",
        created_at: now,
        updated_at: now,
        participants: [
          {
            id: "PART-001",
            name: "A",
            email: "a@example.com",
            role: "external",
            response: "pending",
          },
        ],
        proposed_slots: [],
        duration_minutes: 60,
        meeting_format: "online",
        ceo_intake_confirmed: true,
        revision: 1,
        next_action: "none",
      })
    );
    recordSecretaryQualityObservation("SCH-2099-010", "baseline ok");
    let row = (await import("../src/lib/scheduling-coordination/store.js")).findSchedulingCase(
      "SCH-2099-010"
    )!;
    expect(row.quality_signals?.ceo_tone_corrections).toBe(0);
    expect(secretaryQualityScore(row)).toBe(0);
    recordSecretaryToneCorrection("SCH-2099-010", "言い回し修正");
    row = (await import("../src/lib/scheduling-coordination/store.js")).findSchedulingCase(
      "SCH-2099-010"
    )!;
    expect(row.quality_signals?.ceo_tone_corrections).toBe(1);
    expect(secretaryQualityScore(row)).toBe(1);
  });
});
