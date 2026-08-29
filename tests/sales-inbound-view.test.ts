import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { loadSalesInquiries, saveSalesInquiries } from "../src/lib/data.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  buildSalesInboundView,
  collectSalesInquiryAlerts,
  formatSalesInboundCeoReply,
  formatSalesInboundMarkdown,
  formatSalesInboundTodayLines,
  countAwaitingResponse,
  isAwaitingResponse,
  isOpenInquiry,
  pipelineHasDealForInquiry,
} from "../src/lib/sales-inbound-view.js";
import { buildSalesInboundCanvasViewModel } from "../src/lib/canvas-views/builders/sales-inbound.js";
import { canvasViewModelSchema } from "../schemas/canvas-view.js";
import {
  buildTodayContext,
  formatTodayContextMarkdown,
} from "../src/lib/steward-chat/today-context.js";
import { computeDashboard } from "../src/lib/dashboard.js";
import type { SalesInquiriesFile, SalesPipelineFile } from "../schemas/index.js";

const INQUIRIES: SalesInquiriesFile = {
  version: 1,
  inquiries: [
    {
      id: "INQ-2026-001",
      subject: "Demo inquiry",
      status: "new",
      source: "web-form",
      company: "Demo Corp",
      received_on: "2020-01-01",
      demo: true,
    },
    {
      id: "INQ-2026-002",
      subject: "Real inquiry",
      status: "triaged",
      source: "email",
      company: "Real Corp",
      received_on: "2026-07-10",
      next_action_due: "2026-08-28",
      next_action: "Follow up",
    },
    {
      id: "INQ-2026-003",
      subject: "Qualified gap",
      status: "qualified",
      source: "email",
      company: "Gap Corp",
      received_on: "2026-07-01",
    },
  ],
};

const PIPELINE: SalesPipelineFile = {
  version: 1,
  deals: [
    {
      id: "DEAL-2026-001",
      title: "Other",
      stage: "lead",
      owner: "dan",
      counterparty: "Other Corp",
    },
  ],
};

describe("sales inbound view", () => {
  it("excludes demo inquiries by default", () => {
    const view = buildSalesInboundView({
      inquiries: INQUIRIES,
      includeDemo: false,
    });
    expect(view.total_inquiries).toBe(2);
    expect(view.notes.some((n) => n.includes("demo"))).toBe(true);
  });

  it("counts awaiting response", () => {
    const view = buildSalesInboundView({
      inquiries: INQUIRIES,
      includeDemo: false,
    });
    expect(countAwaitingResponse(view)).toBe(1);
    expect(view.by_status.triaged).toBe(1);
  });

  it("detects stale new and due soon alerts", () => {
    const alerts = collectSalesInquiryAlerts(
      INQUIRIES.inquiries.filter((i) => !i.demo),
      {
        asOf: "2026-08-24",
        staleDays: 3,
        actionHorizonDays: 7,
      },
    );
    expect(alerts.some((a) => a.alert_type === "due_soon")).toBe(true);
  });

  it("warns qualified without pipeline deal", () => {
    const view = buildSalesInboundView({
      inquiries: INQUIRIES,
      pipeline: PIPELINE,
      includeDemo: false,
    });
    expect(view.notes.some((n) => n.includes("INQ-2026-003"))).toBe(true);
  });

  it("does not treat shared tags alone as pipeline linkage", () => {
    const view = buildSalesInboundView({
      inquiries: {
        version: 1,
        inquiries: [
          {
            id: "INQ-2026-010",
            subject: "Tag overlap only",
            status: "qualified",
            source: "email",
            company: "Unlinked Corp",
            received_on: "2026-08-01",
            tags: ["hospitality"],
          },
        ],
      },
      pipeline: {
        version: 1,
        deals: [
          {
            id: "DEAL-2026-010",
            title: "Tagged deal",
            stage: "lead",
            owner: "dan",
            counterparty: "Other Corp",
            tags: ["hospitality"],
          },
        ],
      },
      includeDemo: false,
    });
    expect(view.notes.some((n) => n.includes("INQ-2026-010"))).toBe(true);
  });

  it("loads mal tenant inquiries", () => {
    setTenantId("mal");
    const view = buildSalesInboundView({ includeDemo: true });
    expect(view.total_inquiries).toBeGreaterThan(0);
    const reply = formatSalesInboundCeoReply(view);
    expect(reply).toMatch(/問合せ/);
    expect(reply).not.toMatch(/@/);
  });

  it("resolves sales inquiries path lazily per tenant", () => {
    setTenantId("demo");
    expect(loadSalesInquiries()).toBeUndefined();
    setTenantId("mal");
    expect(loadSalesInquiries()?.inquiries.length).toBeGreaterThan(0);
  });

  it("formats markdown with L1 contract and no contact fields", () => {
    const view = buildSalesInboundView({
      inquiries: INQUIRIES,
      pipeline: PIPELINE,
      includeDemo: false,
    });
    const md = formatSalesInboundMarkdown(view);
    expect(md).toMatch(/^# インバウンド問合せ/);
    expect(md).toContain("**SoT Path:**");
    expect(md).toContain("| 問合せID | 会社 | 種別 |");
    expect(md).toContain("## 注記");
    expect(md).not.toMatch(/@/);
    expect(md).not.toMatch(/03-/);
  });

  it("formats Today lines from view counts", () => {
    const view = buildSalesInboundView({
      inquiries: INQUIRIES,
      includeDemo: false,
    });
    const lines = formatSalesInboundTodayLines(view);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain(`未クローズ ${view.open_inquiries}`);
    expect(lines[1]).toContain("new");
    expect(lines[2]).toMatch(/アラート:/);
  });

  it("classifies open and awaiting inquiries", () => {
    expect(isOpenInquiry({ id: "x", subject: "a", status: "closed", company: "A" })).toBe(false);
    expect(isOpenInquiry({ id: "x", subject: "a", status: "qualified", company: "A" })).toBe(true);
    expect(isAwaitingResponse({ id: "x", subject: "a", status: "new", company: "A" })).toBe(true);
    expect(isAwaitingResponse({ id: "x", subject: "a", status: "triaged", company: "A" })).toBe(true);
    expect(isAwaitingResponse({ id: "x", subject: "a", status: "qualified", company: "A" })).toBe(false);
  });

  it("links pipeline deals by company name only", () => {
    const inquiry = {
      id: "INQ-2026-011",
      subject: "Linked",
      status: "qualified" as const,
      source: "email" as const,
      company: "Other Corp",
      received_on: "2026-08-01",
      tags: ["hospitality"],
    };
    expect(pipelineHasDealForInquiry(inquiry, PIPELINE)).toBe(true);
    expect(
      pipelineHasDealForInquiry(
        { ...inquiry, company: "Unlinked Corp" },
        PIPELINE,
      ),
    ).toBe(false);
    expect(pipelineHasDealForInquiry(inquiry, undefined)).toBe(false);
  });

  it("builds valid canvas view model", () => {
    setTenantId("mal");
    const vm = buildSalesInboundCanvasViewModel({ includeDemo: true });
    expect(canvasViewModelSchema.safeParse(vm).success).toBe(true);
    expect(vm.view_id).toBe("inbound");
    expect(vm.suite).toBe("sales");
    expect(vm.sections).toHaveLength(3);
    expect(vm.links?.present_cmd).toBe("orgos sales inbound");
  });

  it("includes inbound KPI in Today context on mal", () => {
    setTenantId("mal");
    const markdown = formatTodayContextMarkdown(buildTodayContext());
    expect(markdown).toContain("インバウンド問合せKPI");
    expect(markdown).toMatch(/問合せ|未クローズ|未対応/);
  });

  it("includes sales_inbound KPI in dashboard on mal", () => {
    setTenantId("mal");
    const kpi = computeDashboard().kpis.find((entry) => entry.id === "sales_inbound");
    expect(kpi).toBeDefined();
    expect(kpi?.label).toBe("未対応問合せ");
    expect(kpi?.explanation).toMatch(/初動 SLA 超過/);
  });
});

describe("sales inquiries tenant isolation", () => {
  function demoSalesDir(): string {
    return join(getDataDir(), "sales");
  }

  beforeEach(() => {
    setTenantId("demo");
    mkdirSync(getDataDir(), { recursive: true });
  });

  afterEach(() => {
    setTenantId("demo");
    const sales = demoSalesDir();
    if (existsSync(sales)) rmSync(sales, { recursive: true, force: true });
    setTenantId("mal");
  });

  it("saveSalesInquiries writes to active tenant only", () => {
    setTenantId("demo");
    saveSalesInquiries({
      version: 1,
      inquiries: [
        {
          id: "INQ-2026-999",
          subject: "demo tenant probe",
          status: "new",
          source: "web-form",
          company: "Demo Tenant Corp",
          received_on: "2026-08-24",
        },
      ],
    });

    expect(
      existsSync(join(demoSalesDir(), "inbound", "inquiries.yaml")),
    ).toBe(true);
    expect(
      loadSalesInquiries()?.inquiries.some((i) => i.id === "INQ-2026-999"),
    ).toBe(true);

    setTenantId("mal");
    expect(
      loadSalesInquiries()?.inquiries.some((i) => i.id === "INQ-2026-999"),
    ).toBe(false);
  });
});
