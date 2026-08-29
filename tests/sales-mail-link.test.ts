import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  linkMailTriageEntry,
  countAmbiguousMailLinks,
  runSalesMailLinkFromTriage,
} from "../src/lib/sales-mail-link.js";
import { loadSalesPipeline, loadSalesInquiries } from "../src/lib/data.js";
import type { MailTriageEntry } from "../schemas/correspondence/mail-triage.js";

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "sales"),
    join(getDataDir(), "customers"),
    join(getDataDir(), "executive"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

function seedBase(): void {
  mkdirSync(join(getDataDir(), "customers"), { recursive: true });
  mkdirSync(join(getDataDir(), "sales"), { recursive: true });
  mkdirSync(join(getDataDir(), "sales", "inbound"), { recursive: true });
  mkdirSync(join(getDataDir(), "executive"), { recursive: true });

  writeFileSync(
    join(getDataDir(), "customers", "accounts.yaml"),
    YAML.stringify({
      version: 1,
      accounts: [
        {
          id: "CUST-2026-001",
          company: "Alpha Co",
          lifecycle: "prospect",
          email_domains: ["alpha.example"],
        },
        {
          id: "CUST-2026-002",
          company: "Beta Co",
          lifecycle: "prospect",
          email_domains: ["shared.example"],
        },
        {
          id: "CUST-2026-003",
          company: "Gamma Co",
          lifecycle: "prospect",
          email_domains: ["shared.example"],
        },
      ],
    }),
    "utf-8",
  );

  writeFileSync(
    join(getDataDir(), "customers", "contacts.yaml"),
    YAML.stringify({
      version: 1,
      contacts: [
        {
          id: "CONTACT-2026-001",
          account_id: "CUST-2026-001",
          name: "A",
          email: "a@alpha.example",
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
          id: "DEAL-2026-001",
          title: "Alpha deal",
          stage: "lead",
          owner_name: "op",
          account_id: "CUST-2026-001",
        },
        {
          id: "DEAL-2026-002",
          title: "Beta deal",
          stage: "qualify",
          owner_name: "op",
          account_id: "CUST-2026-002",
        },
        {
          id: "DEAL-2026-003",
          title: "Gamma deal",
          stage: "qualify",
          owner_name: "op",
          account_id: "CUST-2026-003",
        },
      ],
    }),
    "utf-8",
  );

  writeFileSync(
    join(getDataDir(), "sales", "inbound", "inquiries.yaml"),
    YAML.stringify({ version: 1, inquiries: [] }),
    "utf-8",
  );
}

function triageEntry(
  partial: Partial<MailTriageEntry> & Pick<MailTriageEntry, "id" | "from">,
): MailTriageEntry {
  return {
    id: partial.id,
    received_at: "2026-08-28T10:00:00+09:00",
    from: partial.from,
    subject: partial.subject ?? "hello",
    importance: "p2",
    urgency: "none",
    disposition: "ham",
    routing: partial.routing ?? "sales_inbound",
    handoff_status: "pending",
    eml_ref: "records/executive/mail-received/x.eml",
    rule_hits: [],
    sender_known: false,
    mail_thread_ids: partial.mail_thread_ids ?? ["thread-1"],
    gmail_thread_id: partial.gmail_thread_id,
  };
}

describe("sales mail-link", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    seedBase();
  });

  afterEach(() => cleanup());

  it("auto-links when exactly one candidate", () => {
    const entry = triageEntry({
      id: "TRIAGE-1",
      from: "Partner <p@alpha.example>",
    });
    const r = linkMailTriageEntry(entry, { actor: "test" });
    expect(r.linked).toBe(true);
    expect(r.target?.id).toBe("DEAL-2026-001");
    const deal = loadSalesPipeline()?.deals.find((d) => d.id === "DEAL-2026-001");
    expect(deal?.mail_thread_ids).toContain("thread-1");
  });

  it("returns ambiguous when multiple domain matches", () => {
    const entry = triageEntry({
      id: "TRIAGE-2",
      from: "X <x@shared.example>",
    });
    const r = linkMailTriageEntry(entry);
    expect(r.linked).toBe(false);
    expect(r.ambiguous?.length).toBeGreaterThan(1);
  });

  it("forceTarget resolves ambiguous", () => {
    const entry = triageEntry({
      id: "TRIAGE-3",
      from: "X <x@shared.example>",
      mail_thread_ids: ["thread-forced"],
    });
    const r = linkMailTriageEntry(entry, {
      forceTarget: { kind: "deal", id: "DEAL-2026-003" },
      actor: "test",
    });
    expect(r.linked).toBe(true);
    expect(r.target?.id).toBe("DEAL-2026-003");
    const deal = loadSalesPipeline()?.deals.find((d) => d.id === "DEAL-2026-003");
    expect(deal?.mail_thread_ids).toContain("thread-forced");
  });

  it("counts ambiguous without requiring force", () => {
    writeFileSync(
      join(getDataDir(), "executive", "mail-triage-queue.yaml"),
      YAML.stringify({
        version: 1,
        entries: [
          triageEntry({
            id: "TRIAGE-A",
            from: "X <x@shared.example>",
          }),
          triageEntry({
            id: "TRIAGE-B",
            from: "Y <y@alpha.example>",
          }),
        ],
      }),
      "utf-8",
    );
    expect(countAmbiguousMailLinks()).toBe(1);
  });

  it("runSalesMailLinkFromTriage buckets auto vs ambiguous", () => {
    writeFileSync(
      join(getDataDir(), "executive", "mail-triage-queue.yaml"),
      YAML.stringify({
        version: 1,
        entries: [
          triageEntry({ id: "T1", from: "a@alpha.example" }),
          triageEntry({ id: "T2", from: "b@shared.example" }),
        ],
      }),
      "utf-8",
    );
    const result = runSalesMailLinkFromTriage({ actor: "test" });
    expect(result.auto_linked.some((x) => x.triage_id === "T1")).toBe(true);
    expect(result.ambiguous.some((x) => x.triage_id === "T2")).toBe(true);
    expect(loadSalesInquiries()?.inquiries ?? []).toEqual([]);
  });
});
