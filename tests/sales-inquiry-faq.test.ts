import { describe, expect, it } from "vitest";
import type { SalesInquiry } from "../schemas/sales.js";
import type { SalesFaqFile } from "../schemas/sales-faq.js";
import {
  evaluateInquiryDeadlineGate,
  matchFaq,
  renderFaqTemplates,
  scoreFaqMatch,
} from "../src/lib/sales-inquiry-faq.js";

const faq: SalesFaqFile = {
  version: 1,
  first_response_sla_days: 3,
  entries: [
    {
      id: "FAQ-001",
      title: "合宿",
      tags: ["hospitality", "corporate"],
      keywords: ["空室", "合宿"],
      subject_template: "Re: {{subject}}",
      body_template: "{{company}} 様\n{{subject}} について",
      next_action: "確認待ち",
    },
    {
      id: "FAQ-003",
      title: "汎用",
      tags: [],
      keywords: [],
      subject_template: "受付: {{subject}}",
      body_template: "受付しました",
    },
  ],
};

const inquiry: SalesInquiry = {
  id: "INQ-2026-101",
  subject: "企業研修合宿の空室確認",
  status: "new",
  company: "株式会社テスト",
  received_on: "2026-08-19",
  tags: ["hospitality", "corporate"],
  body_ref: "records/sales/inbound/INQ-2026-101-body.md",
};

describe("sales inquiry FAQ reply", () => {
  it("matches hospitality corporate FAQ by tags and keywords", () => {
    const scored = scoreFaqMatch(inquiry, faq.entries[0]!);
    expect(scored).toBeGreaterThan(3);
    const matched = matchFaq(inquiry, faq);
    expect(matched?.entry.id).toBe("FAQ-001");
    const rendered = renderFaqTemplates(matched!.entry, inquiry);
    expect(rendered.subject).toContain("空室確認");
    expect(rendered.body).toContain("株式会社テスト");
    expect(rendered.body).not.toMatch(/@|電話|〒/);
  });

  it("blocks on stale new SLA without dumping L2", () => {
    const gate = evaluateInquiryDeadlineGate(inquiry, "2026-09-22", 3);
    expect(gate.blocked).toBe(true);
    expect(gate.alert_type).toBe("stale_new");
    expect(JSON.stringify(gate)).not.toContain("records/");
  });

  it("falls back to generic FAQ when no keyword/tag hit", () => {
    const other: SalesInquiry = {
      id: "INQ-2026-099",
      subject: "その他のご質問",
      status: "new",
      company: "例社",
    };
    const matched = matchFaq(other, faq);
    expect(matched?.entry.id).toBe("FAQ-003");
  });
});
