import { beforeEach, describe, it, expect } from "vitest";
import {
  plannedMonthlyRevenue,
  plannedMonthlyExpenses,
  generateForecast,
} from "../src/lib/forecast.js";
import { analyzeProperty } from "../src/lib/analyze.js";
import { scanContractAlerts } from "../src/lib/alerts.js";
import { runScenario } from "../src/lib/scenario.js";
import { fiscalYearNumber } from "../src/lib/pdf.js";
import { buildKessanPlRows } from "../src/lib/kessan-pdf.js";
import { loadYojitsuFyPlan } from "../src/lib/data.js";
import type { PropertyRevenuePlan, Property, MonthlyFinance, FixedCosts, Loans, Contract } from "../schemas/index.js";
import { setTenantId } from "../src/lib/tenant.js";

beforeEach(() => {
  setTenantId("mal");
});

const samplePlan: PropertyRevenuePlan = {
  rental: [
    {
      property_id: "PROP-001",
      monthly_rent: 350000,
      vacancy_rate: 0.05,
      management_fee: 25000,
    },
  ],
  hotel: [
    {
      property_id: "PROP-002",
      room_count: 12,
      occupancy_rate: 0.65,
      adr: 18000,
    },
  ],
};

const sampleProperties: Property[] = [
  {
    id: "PROP-001",
    name: "Test Rental",
    location: "Tokyo",
    type: "rental",
    rental: { monthly_rent: 350000, vacancy_rate: 0.05, management_fee: 25000 },
  },
  {
    id: "PROP-002",
    name: "Test Hotel",
    location: "Hakone",
    type: "hotel",
    hotel: { room_count: 12, occupancy_rate: 0.65, adr: 18000 },
  },
];

const sampleFixedCosts: FixedCosts = {
  items: [{ name: "Rent", monthly_amount: 80000 }],
};

const sampleLoans: Loans = {
  loans: [
    {
      id: "LOAN-001",
      lender: "Bank",
      balance: 30000000,
      interest_rate: 0.015,
      monthly_payment: 120000,
      maturity_date: "2040-03-31",
    },
  ],
};

const sampleFinances: MonthlyFinance[] = [
  {
    month: "2026-01",
    revenue: [
      { property_id: "PROP-001", category: "rent", amount: 350000 },
      { property_id: "PROP-002", category: "hotel_revenue", amount: 4200000 },
    ],
    expenses: [
      { property_id: "PROP-001", category: "management_fee", amount: 25000 },
      { category: "fixed_rent", amount: 80000 },
      { category: "loan_payment", amount: 120000 },
    ],
  },
];

describe("forecast", () => {
  it("calculates planned monthly revenue for rental and hotel", () => {
    const revenue = plannedMonthlyRevenue(samplePlan, sampleProperties);
    const rentalPart = 350000 * 0.95;
    const hotelPart = 12 * 0.65 * 18000 * 30;
    expect(revenue).toBeCloseTo(rentalPart + hotelPart);
  });

  it("applies vacancy rate override in scenario", () => {
    const baseline = plannedMonthlyRevenue(samplePlan, sampleProperties);
    const scenario = plannedMonthlyRevenue(samplePlan, sampleProperties, {
      vacancyRate: 0.15,
    });
    expect(scenario).toBeLessThan(baseline);
  });

  it("generates forecast with actual and planned months", () => {
    const forecast = generateForecast(
      sampleFinances,
      sampleFixedCosts,
      sampleLoans,
      samplePlan,
      sampleProperties,
      { months: 3, startMonth: "2026-01" }
    );
    expect(forecast).toHaveLength(3);
    expect(forecast[0].source).toBe("actual");
    expect(forecast[1].source).toBe("planned");
    expect(forecast[0].revenue).toBe(350000 + 4200000);
  });

  it("includes fixed costs in planned expenses", () => {
    const expenses = plannedMonthlyExpenses(samplePlan, sampleFixedCosts);
    expect(expenses).toBeGreaterThan(80000);
  });
});

describe("analyze", () => {
  it("computes property analysis with variance", () => {
    const analysis = analyzeProperty(
      sampleProperties[0],
      samplePlan,
      sampleFinances,
      "2026-01",
      "2026-01"
    );
    expect(analysis.propertyId).toBe("PROP-001");
    expect(analysis.actual.totalRevenue).toBe(350000);
    expect(analysis.planned.monthlyRevenue).toBeCloseTo(350000 * 0.95);
  });

  it("computes hotel RevPAR in plan", () => {
    const analysis = analyzeProperty(
      sampleProperties[1],
      samplePlan,
      sampleFinances,
      "2026-01",
      "2026-01"
    );
    expect(analysis.planned.revpar).toBeCloseTo(0.65 * 18000);
  });
});

describe("alerts", () => {
  function offsetDate(daysFromToday: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysFromToday);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const contracts: Contract[] = [
    {
      id: "CTR-001",
      name: "Test Contract",
      counterparty: "Partner",
      type: "management",
      start_date: "2024-01-01",
      end_date: offsetDate(14),
      auto_renewal: false,
      risk: {
        renewal_deadline: offsetDate(7),
        risk_level: "high",
        notes: "Urgent",
      },
    },
    {
      id: "CTR-002",
      name: "Future Contract",
      counterparty: "Partner2",
      type: "advisory",
      start_date: "2024-01-01",
      end_date: "2030-01-01",
      auto_renewal: true,
    },
  ];

  it("finds alerts within days ahead", () => {
    const alerts = scanContractAlerts(contracts, 365);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some((a) => a.contractId === "CTR-001")).toBe(true);
    expect(alerts.some((a) => a.contractId === "CTR-002")).toBe(false);
  });

  it("filters by risk level", () => {
    const alerts = scanContractAlerts(contracts, 365, "high");
    expect(alerts.every((a) => a.riskLevel === "high")).toBe(true);
  });

  it("sorts by risk level then days remaining", () => {
    const alerts = scanContractAlerts(contracts, 365);
    if (alerts.length >= 2) {
      expect(["high", "medium", "low"]).toContain(alerts[0].riskLevel);
    }
  });
});

describe("scenario", () => {
  it("compares baseline and scenario cash flow", () => {
    const data = {
      company: { name: "Test" },
      properties: sampleProperties,
      contracts: [],
      monthlyFinances: sampleFinances,
      fixedCosts: sampleFixedCosts,
      loans: sampleLoans,
      businessPlan: { years: [] },
      propertyRevenuePlan: samplePlan,
    };

    const baseline = runScenario(data, { name: "Baseline", overrides: {} }, 3);
    const scenario = runScenario(
      data,
      { name: "High Vacancy", overrides: { vacancyRate: 0.2 } },
      3
    );

    expect(scenario.totalNetCashFlow).toBeLessThanOrEqual(baseline.totalNetCashFlow);
  });
});

describe("annual reports", () => {
  it("computes fiscal year number from establishment", () => {
    expect(fiscalYearNumber("2018-02-09", "2027-01")).toBe(9);
  });

  it("builds kessan PL rows from FY2026 yojitsu", () => {
    const yojitsu = loadYojitsuFyPlan("FY2026");
    expect(yojitsu).toBeDefined();
    const rows = buildKessanPlRows(yojitsu!);
    const netRow = rows.find((r) => r.label === "当期純利益");
    expect(netRow?.amount).toBe(3391309);
    const revenueRow = rows.find((r) => r.label === "売上高 合計");
    expect(revenueRow?.amount).toBe(7500000);
  });
});
