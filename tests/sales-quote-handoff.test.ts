import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { createQuote, setQuoteStatus } from "../src/lib/sales-quote-service.js";
import { handoffWonDeal, promoteInquiryToDeal } from "../src/lib/sales-handoff.js";
import { loadCustomerAccounts, loadSalesInquiries, loadSalesPipeline } from "../src/lib/data.js";

function cleanup(): void {
  for (const p of [join(getDataDir(), "sales"), join(getDataDir(), "customers")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

function seed(): void {
  mkdirSync(join(getDataDir(), "customers"), { recursive: true });
  mkdirSync(join(getDataDir(), "sales"), { recursive: true });
  mkdirSync(join(getDataDir(), "sales", "inbound"), { recursive: true });
  mkdirSync(join(getDataDir(), "sales"), { recursive: true });

  writeFileSync(
    join(getDataDir(), "customers", "accounts.yaml"),
    YAML.stringify({
      version: 1,
      accounts: [
        {
          id: "CUST-2026-010",
          company: "Prospect Co",
          lifecycle: "prospect",
        },
      ],
    }),
    "utf-8",
  );

  writeFileSync(
    join(getDataDir(), "sales", "pipeline.yaml"),
    YAML.stringify({
      version: 1,
      deals: [
        {
          id: "DEAL-2026-010",
          title: "Won deal",
          stage: "won",
          owner_name: "op",
          account_id: "CUST-2026-010",
          amount_man: 120,
        },
      ],
    }),
    "utf-8",
  );

  writeFileSync(
    join(getDataDir(), "sales", "inbound", "inquiries.yaml"),
    YAML.stringify({
      version: 1,
      inquiries: [
        {
          id: "INQ-2026-010",
          received_on: "2026-08-01",
          subject: "Demo request",
          company: "Prospect Co",
          status: "qualified",
          account_id: "CUST-2026-010",
          owner_name: "op",
        },
      ],
    }),
    "utf-8",
  );

  writeFileSync(
    join(getDataDir(), "sales", "quotes.yaml"),
    YAML.stringify({ version: 1, quotes: [] }),
    "utf-8",
  );
}

describe("sales quote + handoff", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    seed();
  });

  afterEach(() => cleanup());

  it("creates quote and updates status to sent", () => {
    const q = createQuote(
      {
        deal_id: "DEAL-2026-010",
        account_id: "CUST-2026-010",
        amount_man: 120,
      },
      "test",
    );
    expect(q.status).toBe("draft");
    const sent = setQuoteStatus({ quoteId: q.id, status: "sent", actor: "test" });
    expect(sent.status).toBe("sent");
    expect(sent.sent_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("handoff-won flips account lifecycle without creating CTR", () => {
    const r = handoffWonDeal({ dealId: "DEAL-2026-010", actor: "test" });
    expect(r.lifecycle).toBe("customer");
    expect(r.work_order_hint).toMatch(/CTR/);
    const account = loadCustomerAccounts()?.accounts.find((a) => a.id === "CUST-2026-010");
    expect(account?.lifecycle).toBe("customer");
    expect(account?.health).toBe("healthy");
  });

  it("promote qualified inquiry to deal and closes inquiry", () => {
    const r = promoteInquiryToDeal({ inquiryId: "INQ-2026-010", actor: "test" });
    expect(r.deal_id).toMatch(/^DEAL-2026-\d{3}$/);
    const inq = loadSalesInquiries()?.inquiries.find((i) => i.id === "INQ-2026-010");
    expect(inq?.status).toBe("closed");
    const deal = loadSalesPipeline()?.deals.find((d) => d.id === r.deal_id);
    expect(deal?.stage).toBe("lead");
    expect(deal?.inquiry_id).toBe("INQ-2026-010");
  });

  it("rejects promote when not qualified", () => {
    const file = join(getDataDir(), "sales", "inbound", "inquiries.yaml");
    writeFileSync(
      file,
      YAML.stringify({
        version: 1,
        inquiries: [
          {
            id: "INQ-2026-011",
            received_on: "2026-08-01",
            subject: "Early",
            company: "Early Co",
            status: "new",
            owner_name: "op",
          },
        ],
      }),
      "utf-8",
    );
    expect(() => promoteInquiryToDeal({ inquiryId: "INQ-2026-011" })).toThrow(/qualified/);
  });
});
