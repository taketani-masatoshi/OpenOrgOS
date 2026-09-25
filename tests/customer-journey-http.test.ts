import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import {
  registerSession,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import { clearTenantId, getTenantDir, setTenantId } from "../src/lib/tenant.js";
import {
  appendJournalEntry,
  loadJournalEntries,
} from "../src/lib/finance/expense-claim-journal.js";
import { loadOperatorRegistry, saveOperatorRegistry } from "../src/lib/org/operators.js";
import type { MonthCloseChecklist } from "../src/lib/product/ledger-month-close-checklist.js";
import { loadBankStatementsLite } from "../src/lib/finance/bank-statements-lite.js";
import { unmatchedBankCountForMonth } from "../src/lib/finance/monthly-close.js";
import { listBankReconciliationWorkbench } from "../src/lib/finance/bank-reconcile-apply.js";
import { ensureLedgerDemoChartOfAccounts } from "../src/lib/product/ledger-coa-ensure.js";

describe("customer journey http", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  let workspace = "";
  const env = { ...process.env };
  const date = new Date().toISOString().slice(0, 10);
  const month = date.slice(0, 7);

  beforeEach(() => {
    workspace = mkdtempSync(
      join(process.env.ORGOS_CUSTOMER_JOURNEY_RUN_ROOT ?? tmpdir(), "cux-journey-")
    );
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_TENANT = "cux-journey-001";
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
    process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK = "1";
    refreshOrgOsPaths();
    clearTenantId();
    provisionLedgerTenant({
      tenantId: "cux-journey-001",
      companyName: "Journey KK",
      adminEmail: "ceo@journey.example",
      plan: "business",
    });
    setTenantId("cux-journey-001");
    ensureLedgerDemoChartOfAccounts();
    // Synthetic first fiscal month, with no operational history to copy.
    const companyPath = join(getTenantDir(), "data/company.yaml");
    const company = YAML.parse(readFileSync(companyPath, "utf8"));
    company.fiscal_year_end_month = Number(month.slice(5)) === 1 ? 12 : Number(month.slice(5)) - 1;
    writeFileSync(companyPath, YAML.stringify(company));
    const registry = loadOperatorRegistry()!;
    registry.operators.push({
      operator_id: "OP-READER",
      display_name: "Synthetic reader",
      role: "readonly",
      status: "active",
    });
    saveOperatorRegistry(registry);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    clearTenantId();
    refreshOrgOsPaths();
  });

  async function start() {
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  }

  function cookieFor(operatorId: string) {
    const { token } = registerSession({
      operator_id: operatorId,
      approver_id: operatorId,
      mode: "prod",
    });
    return `${WIRE_CONSOLE_SESSION_COOKIE}=${token}`;
  }

  async function post(path: string, cookie: string, body: unknown, status = 200) {
    const response = await fetch(`${baseUrl}/chat/v1/ledger/${path}`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json", Connection: "close" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    expect(response.status, `${path}: ${text}`).toBe(status);
    return JSON.parse(text);
  }

  it(
    "runs setup → bank reconciliation → proposal approval → period lock → accountant CSV",
    async () => {
    await start();
    const cookie = cookieFor("OP-001");
    const reader = cookieFor("OP-READER");

    const onboard0 = await fetch(`${baseUrl}/chat/v1/product/onboarding`, {
      headers: { Cookie: cookie },
    });
    expect(onboard0.status).toBe(200);
    const ob0 = (await onboard0.json()) as { customer_ready: boolean };
    expect(ob0.customer_ready).toBe(false);

    const setup = await fetch(`${baseUrl}/chat/v1/product/onboarding/setup`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ company_name: "Journey Test KK" }),
    });
    expect(setup.status).toBe(200);

    const je = await fetch(`${baseUrl}/chat/v1/ledger/manual-entry`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "初回手動仕訳",
        debit_account: "5100",
        credit_account: "1100",
        amount_yen: 5000,
      }),
    });
    expect(je.status).toBe(200);

    const onboard1 = await fetch(`${baseUrl}/chat/v1/product/onboarding`, {
      headers: { Cookie: cookie },
    });
    const ob1 = (await onboard1.json()) as { customer_ready: boolean };
    expect(ob1.customer_ready).toBe(true);

    const tpl = await fetch(`${baseUrl}/chat/v1/ledger/bank-csv-template?preset=generic`, {
      headers: { Cookie: cookie },
    });
    expect(tpl.status).toBe(200);
    const tplBody = (await tpl.json()) as { presets: unknown[] };
    expect(tplBody.presets.length).toBeGreaterThan(0);

    // Existing invoice is synthetic starting data, not a direct mutation of
    // the bank match, approval or close state under test.
    const financeDir = join(getTenantDir(), "data/finance");
    writeFileSync(
      join(financeDir, "ar-ap-ledger.yaml"),
      YAML.stringify({
        as_of: date,
        currency: "JPY",
        entries: [
          {
            id: "AR-JOURNEY-001",
            kind: "ar",
            amount: 120000,
            category: "rent",
            booked_date: date,
            due_date: date,
            counterparty: "Customer",
            description: "Synthetic invoice",
            account_id: "BANK-001",
            chart_account_id: "4100",
            status: "open",
            source: "ar-ap",
          },
        ],
      })
    );
    appendJournalEntry(
      {
        entry_id: "JE-JOURNEY-RECEIVABLE",
        occurred_at: `${date}T00:00:00.000Z`,
        description: "Synthetic invoice",
        source: { kind: "manual", authorized_by: "OP-001" },
        evidence_refs: ["synthetic:journey"],
        lines: [
          {
            account_code: "1150",
            debit_yen: 120000,
            credit_yen: 0,
            tax_category: "out_of_scope",
            counterparty_id: "Customer",
          },
          { account_code: "4100", debit_yen: 0, credit_yen: 120000, tax_category: "out_of_scope" },
        ],
      },
      { postedBy: "OP-001" }
    );

    const csv = [
      "date,direction,amount,category,description,account_id,reference,counterparty",
      `${date},inflow,120000,rent,Synthetic rent,BANK-001,AR-JOURNEY-001,Customer`,
    ].join("\n");

    const dry = await fetch(`${baseUrl}/chat/v1/ledger/bank-statements/import`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ csv_text: csv, dry_run: true, preset: "generic" }),
    });
    expect(dry.status).toBe(200);
    const dryBody = (await dry.json()) as { dry_run: boolean; added: number };
    expect(dryBody.dry_run).toBe(true);
    expect(dryBody.added).toBeGreaterThanOrEqual(1);
    expect(existsSync(join(financeDir, "bank-statements.yaml"))).toBe(false);

    const imp = await fetch(`${baseUrl}/chat/v1/ledger/bank-statements/import`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ csv_text: csv, write: true, preset: "generic" }),
    });
    expect(imp.status).toBe(200);
    const imported = (await imp.json()) as { added: number; entry_ids: string[] };
    expect(imported.added).toBe(1);
    const repeated = await post("bank-statements/import", cookie, {
      csv_text: csv,
      write: true,
      preset: "generic",
    });
    expect(repeated.added).toBe(0);
    const blocked = await post("period", cookie, { month, action: "lock" }, 422);
    expect(
      blocked.checklist.items.find(
        (item: { id: string; pass: boolean }) => item.id === "bank-unmatched"
      )?.pass
    ).toBe(false);
    const bankSnapshot = readFileSync(join(financeDir, "bank-statements.yaml"), "utf8");
    const partial = await post("bank-reconcile", cookie, {
      bank_id: imported.entry_ids[0],
      ar_ap_id: "AR-JOURNEY-001",
      amount_yen: 60000,
      effective_date: date,
      reason: "Synthetic partial approval",
    });
    expect(loadBankStatementsLite()?.entries[0]?.status).toBe("partial");
    expect(unmatchedBankCountForMonth(month)).toBe(1);
    expect(listBankReconciliationWorkbench().unmatched[0]?.amount).toBe(60000);
    await post("period", cookie, { month, action: "lock" }, 422);
    const reconciled = await post("bank-reconcile", cookie, {
      bank_id: imported.entry_ids[0],
      ar_ap_id: "AR-JOURNEY-001",
      amount_yen: 60000,
      effective_date: date,
      reason: "Synthetic final approval",
    });
    expect(reconciled.entry_id).toMatch(/^JE-/);
    expect(loadBankStatementsLite()?.entries[0]?.status).toBe("matched");
    expect(listBankReconciliationWorkbench().unmatched_count).toBe(0);
    expect(readFileSync(join(financeDir, "bank-statements.yaml"), "utf8")).toBe(bankSnapshot);

    const cl = await fetch(`${baseUrl}/chat/v1/ledger/month-close-checklist?month=${month}`, {
      headers: { Cookie: cookie },
    });
    expect(cl.status).toBe(200);
    const clBody = (await cl.json()) as {
      checklist: { items: Array<{ id: string; pass: boolean }> };
    };
    expect(clBody.checklist.items.find((i) => i.id === "bank-imported")?.pass).toBe(true);

    const beforeProposal = loadJournalEntries().entries.length;
    const prop = await fetch(`${baseUrl}/chat/v1/ledger/proposals`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "提案テスト",
        debit_account: "5100",
        credit_account: "1100",
        amount_yen: 1000,
        source: "chat",
      }),
    });
    expect(prop.status).toBe(200);
    const propBody = (await prop.json()) as { proposal: { id: string } };
    expect(loadJournalEntries().entries.length).toBe(beforeProposal);
    await post("proposals/approve", reader, { proposal_id: propBody.proposal.id }, 403);
    expect(loadJournalEntries().entries.length).toBe(beforeProposal);
    const approve = await fetch(`${baseUrl}/chat/v1/ledger/proposals/approve`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ proposal_id: propBody.proposal.id }),
    });
    expect(approve.status).toBe(200);
    const appBody = (await approve.json()) as { entry_id: string };
    expect(appBody.entry_id).toMatch(/^JE-/);
    expect(loadJournalEntries().entries.length).toBe(beforeProposal + 1);
    await post("proposals/approve", cookie, { proposal_id: propBody.proposal.id }, 422);
    expect(loadJournalEntries().entries.length).toBe(beforeProposal + 1);

    const ready = await fetch(`${baseUrl}/chat/v1/ledger/month-close-checklist?month=${month}`, {
      headers: { Cookie: cookie },
    });
    expect(ready.status).toBe(200);
    const readyBody = (await ready.json()) as { checklist: MonthCloseChecklist };
    expect(readyBody.checklist.ready, JSON.stringify(readyBody.checklist)).toBe(true);
    expect(readyBody.checklist.period_locked).toBe(false);
    await post("period", reader, { month, action: "lock" }, 403);
    expect((await post("period", cookie, { month, action: "lock" })).status).toBe("locked");
    const closed = await fetch(`${baseUrl}/chat/v1/ledger/month-close-checklist?month=${month}`, {
      headers: { Cookie: cookie },
    });
    expect(
      ((await closed.json()) as { checklist: MonthCloseChecklist }).checklist.period_locked
    ).toBe(true);
    await post(
      "manual-entry",
      cookie,
      {
        description: "Locked month write",
        debit_account: "5100",
        credit_account: "1100",
        amount_yen: 1,
        occurred_at: `${date}T00:00:00.000Z`,
      },
      422
    );
    expect(loadJournalEntries().entries.length).toBe(beforeProposal + 1);

    const exported = await fetch(
      `${baseUrl}/chat/v1/ledger/export?template=journal-csv&from=${month}-01&to=${date}`,
      { headers: { Cookie: reader } }
    );
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-type")).toContain("text/csv");
    const rows = await exported.text();
    for (const id of [
      "JE-JOURNEY-RECEIVABLE",
      partial.entry_id,
      reconciled.entry_id,
      appBody.entry_id,
    ]) {
      expect(rows.split("\n").filter((line) => line.startsWith(`${id},`))).toHaveLength(2);
    }

    // Projection-only regression checks on the same disposable fixture:
    // historical cutoff, reversal, void and corrupt events never rewrite imports.
    const previousDate = new Date(Date.parse(`${date}T00:00:00.000Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(loadBankStatementsLite(previousDate)?.entries[0]?.status).toBe("unmatched");
    const eventsPath = join(financeDir, "reconciliation-events.yaml");
    const events = YAML.parse(readFileSync(eventsPath, "utf8"));
    const reversed = {
      id: "rec-journey-reversal",
      type: "reconciliation.reversed",
      occurred_at: new Date().toISOString(),
      effective_date: date,
      actor_id: "OP-001",
      target_event_id: reconciled.event_id,
      reason: "Synthetic projection check",
    };
    writeFileSync(eventsPath, YAML.stringify({ ...events, events: [...events.events, reversed] }));
    expect(loadBankStatementsLite()?.entries[0]?.status).toBe("partial");
    expect(unmatchedBankCountForMonth(month)).toBe(1);
    const voided = {
      id: "rec-journey-void",
      type: "bank_statement.voided",
      occurred_at: new Date().toISOString(),
      effective_date: date,
      actor_id: "OP-001",
      bank_statement_id: imported.entry_ids[0],
      reason: "Synthetic duplicate",
    };
    // A voided statement with no active allocations is excluded from unmatched.
    writeFileSync(eventsPath, YAML.stringify({ ...events, events: [voided] }));
    expect(loadBankStatementsLite()?.entries[0]?.status).toBe("voided");
    expect(unmatchedBankCountForMonth(month)).toBe(0);
    writeFileSync(
      eventsPath,
      YAML.stringify({ ...events, events: [{ ...reversed, target_event_id: "missing" }] })
    );
    expect(loadBankStatementsLite()).toBeNull();
    expect(unmatchedBankCountForMonth(month)).toBe(Number.POSITIVE_INFINITY);
    expect(readFileSync(join(financeDir, "bank-statements.yaml"), "utf8")).toBe(bankSnapshot);
  },
  120_000
  );
});
