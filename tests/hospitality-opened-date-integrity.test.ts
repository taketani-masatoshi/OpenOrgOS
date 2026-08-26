import { describe, it, expect } from "vitest";
import { collectOpenedDateIntegrityIssues } from "../src/lib/hospitality/opened-date-integrity.js";

describe("opened_date integrity", () => {
  const props = [{ id: "PROP-002", hotel: { room_count: 1, opened_date: "2026-09-18" } }];

  it("warns when stay check_in is before opened_date", () => {
    const issues = collectOpenedDateIntegrityIssues({
      properties: props,
      stays: [
        {
          id: "STAY-2026-001",
          property_id: "PROP-002",
          status: "checked_out",
          check_in: "2026-08-01",
        },
      ],
    });
    expect(issues.some((i) => i.file.includes("stays") && i.level === "warning")).toBe(true);
  });

  it("skips cancelled stays", () => {
    const issues = collectOpenedDateIntegrityIssues({
      properties: props,
      stays: [
        {
          id: "STAY-2026-099",
          property_id: "PROP-002",
          status: "cancelled",
          check_in: "2026-08-01",
        },
      ],
    });
    expect(issues.filter((i) => i.file.includes("stays"))).toHaveLength(0);
  });

  it("warns on tax assessment period before open month", () => {
    const issues = collectOpenedDateIntegrityIssues({
      properties: props,
      stays: [],
      assessments: [
        {
          id: "TAX-1",
          stay_id: "STAY-2026-001",
          property_id: "PROP-002",
          period: "2026-08",
        },
      ],
    });
    expect(issues.some((i) => i.file.includes("lodging-tax"))).toBe(true);
  });

  it("warns when plan room_count diverges from SSOT or >1", () => {
    const issues = collectOpenedDateIntegrityIssues({
      properties: props,
      stays: [],
      hotelRevenuePlans: [{ property_id: "PROP-002", room_count: 3 }],
    });
    expect(issues.filter((i) => i.file.includes("property-revenue")).length).toBeGreaterThanOrEqual(2);
  });
});
