import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { followUpFromSent } from "../src/lib/sales-follow-up.js";
import { mergeCustomerAccounts } from "../src/lib/sales-account-merge.js";
import { findDeal } from "../src/lib/sales-deal-service.js";
import {
  loadCustomerAccounts,
  loadCustomerContacts,
  loadSalesPipeline,
} from "../src/lib/data.js";

function cleanup(): void {
  for (const p of [
    join(getDataDir(), "sales"),
    join(getDataDir(), "customers"),
    join(getDocsDir(), "executive", "correspondence-drafts"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

function seed(): void {
  mkdirSync(join(getDataDir(), "customers"), { recursive: true });
  mkdirSync(join(getDataDir(), "sales"), { recursive: true });
  mkdirSync(join(getDataDir(), "sales", "inbound"), { recursive: true });
  mkdirSync(join(getDataDir(), "sales"), { recursive: true });
  mkdirSync(join(getDocsDir(), "executive", "correspondence-drafts"), {
    recursive: true,
  });

  writeFileSync(
    join(getDataDir(), "customers", "accounts.yaml"),
    YAML.stringify({
      version: 1,
      accounts: [
        { id: "CUST-2026-020", company: "From Co", lifecycle: "prospect" },
        { id: "CUST-2026-021", company: "Into Co", lifecycle: "prospect" },
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
          id: "CONTACT-2026-020",
          account_id: "CUST-2026-020",
          name: "Move me",
          email: "move@from.example",
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
          id: "DEAL-2026-020",
          title: "Follow deal",
          stage: "proposal",
          owner_name: "op",
          account_id: "CUST-2026-020",
          amount_man: 50,
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
  writeFileSync(
    join(getDataDir(), "sales", "quotes.yaml"),
    YAML.stringify({ version: 1, quotes: [] }),
    "utf-8",
  );

  writeFileSync(
    join(
      getDocsDir(),
      "executive",
      "correspondence-drafts",
      "DRAFT-20260828-001.yaml",
    ),
    YAML.stringify({
      draft_id: "DRAFT-20260828-001",
      channel: "email",
      status: "sent",
      created_at: "2026-08-28T09:00:00+09:00",
      created_by: "op",
      to: "x@example.com",
      subject: "Proposal",
      body: "Body",
      sent_at: "2026-08-28T10:00:00+09:00",
      sent_by: "op",
      deal_id: "DEAL-2026-020",
      attachment_refs: [],
    }),
    "utf-8",
  );
}

describe("sales follow-up + account merge", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    seed();
  });

  afterEach(() => cleanup());

  it("requires --confirm for follow-up-from-sent", () => {
    expect(() =>
      followUpFromSent({ dealId: "DEAL-2026-020", confirm: false }),
    ).toThrow(/confirm/);
  });

  it("sets next_action from sent draft", () => {
    const r = followUpFromSent({
      dealId: "DEAL-2026-020",
      confirm: true,
      actor: "test",
    });
    expect(r.next_action).toBe("フォローアップ");
    expect(r.next_action_due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const deal = findDeal("DEAL-2026-020");
    expect(deal?.next_action).toBe("フォローアップ");
    expect(deal?.next_action_due).toBe(r.next_action_due);
  });

  it("merges accounts and rewrites FKs", () => {
    const r = mergeCustomerAccounts({
      fromId: "CUST-2026-020",
      intoId: "CUST-2026-021",
      actor: "test",
    });
    expect(r.contacts_moved).toBe(1);
    expect(r.deals_updated).toBe(1);
    expect(loadCustomerAccounts()?.accounts.some((a) => a.id === "CUST-2026-020")).toBe(
      false,
    );
    expect(
      loadCustomerContacts()?.contacts.every((c) => c.account_id === "CUST-2026-021"),
    ).toBe(true);
    expect(loadSalesPipeline()?.deals[0]?.account_id).toBe("CUST-2026-021");
  });

  it("dry-run merge does not persist", () => {
    mergeCustomerAccounts({
      fromId: "CUST-2026-020",
      intoId: "CUST-2026-021",
      dryRun: true,
    });
    expect(loadCustomerAccounts()?.accounts.some((a) => a.id === "CUST-2026-020")).toBe(
      true,
    );
  });
});
