// @catalog-ids: customer_success
import { describe, expect, it } from "vitest";
import type { CustomerAccount } from "../schemas/customer-success/index.js";
import {
  computeAccountHealth,
  type AccountHealthInput,
} from "../src/lib/customer-success/health-score.js";
import { loadHealthRubric, clearHealthRubricCache } from "../src/lib/customer-success/health-rubric.js";

describe("customer success health score", () => {
  it("loads rubric from module SSOT", () => {
    clearHealthRubricCache();
    const rubric = loadHealthRubric();
    expect(rubric.version).toBe(1);
    expect(rubric.thresholds.healthy_min).toBe(70);
  });

  it("computes healthy score for well-maintained account", () => {
    const rubric = loadHealthRubric();
    const account: CustomerAccount = {
      id: "CUST-2026-001",
      company: "Example",
      health: "healthy",
      last_contact_on: "2026-08-20",
      renewal_date: "2027-03-31",
      next_action_due: "2026-09-01",
    };
    const input: AccountHealthInput = {
      account,
      asOf: "2026-08-24",
      latestSignal: {
        id: "CSS-2026-001",
        account_id: "CUST-2026-001",
        observed_on: "2026-08-20",
        usage_index: 80,
        open_tickets: 0,
      },
      latestNps: {
        id: "NPS-2026-001",
        account_id: "CUST-2026-001",
        surveyed_on: "2026-08-01",
        score: 9,
      },
    };
    const result = computeAccountHealth(input, rubric);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.recommended).toBe("healthy");
    expect(result.drift).toBe(false);
  });

  it("detects drift when declared differs from recommended", () => {
    const rubric = loadHealthRubric();
    const account: CustomerAccount = {
      id: "CUST-2026-003",
      company: "At Risk Corp",
      health: "healthy",
      last_contact_on: "2026-05-01",
      renewal_date: "2026-09-15",
      next_action_due: "2026-08-01",
    };
    const result = computeAccountHealth(
      {
        account,
        asOf: "2026-08-24",
        latestSignal: {
          id: "CSS-2026-003",
          account_id: "CUST-2026-003",
          observed_on: "2026-08-15",
          usage_index: 15,
          open_tickets: 8,
          escalations_90d: 2,
        },
        latestNps: {
          id: "NPS-2026-003",
          account_id: "CUST-2026-003",
          surveyed_on: "2026-07-25",
          score: 4,
        },
      },
      rubric,
    );
    expect(result.recommended).not.toBe("healthy");
    expect(result.drift).toBe(true);
  });

  it("does not compute score for churned accounts", () => {
    const rubric = loadHealthRubric();
    const result = computeAccountHealth(
      {
        account: {
          id: "CUST-2026-099",
          company: "Churned",
          health: "churned",
        },
        asOf: "2026-08-24",
      },
      rubric,
    );
    expect(result.score).toBe(0);
    expect(result.recommended).toBe("churned");
    expect(result.drift).toBe(false);
  });
});
