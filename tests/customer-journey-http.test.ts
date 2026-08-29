import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
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
import { setTenantId } from "../src/lib/tenant.js";
import { ensureLedgerDemoChartOfAccounts } from "../src/lib/product/ledger-coa-ensure.js";

describe("customer journey http", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  let workspace = "";
  const env = { ...process.env };

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "cux-journey-"));
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_TENANT = "cux-journey-001";
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
    refreshOrgOsPaths();
    provisionLedgerTenant({
      tenantId: "cux-journey-001",
      companyName: "Journey KK",
      adminEmail: "ceo@journey.example",
      plan: "business",
    });
    setTenantId("cux-journey-001");
    ensureLedgerDemoChartOfAccounts();
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
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

  it("runs setup → JE → bank → close → propose path", async () => {
    await start();
    const cookie = cookieFor("OP-001");

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

    const csv = [
      "date,direction,amount,category,description,account_id,reference,counterparty",
      "2026-06-15,inflow,120000,rent,六月賃料,BANK-001,AR-001,Customer",
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

    const imp = await fetch(`${baseUrl}/chat/v1/ledger/bank-statements/import`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ csv_text: csv, write: true, preset: "generic" }),
    });
    expect(imp.status).toBe(200);

    const cl = await fetch(`${baseUrl}/chat/v1/ledger/month-close-checklist?month=2026-06`, {
      headers: { Cookie: cookie },
    });
    expect(cl.status).toBe(200);
    const clBody = (await cl.json()) as {
      checklist: { items: Array<{ id: string; pass: boolean }> };
    };
    expect(clBody.checklist.items.find((i) => i.id === "bank-imported")?.pass).toBe(
      true,
    );

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
    const approve = await fetch(`${baseUrl}/chat/v1/ledger/proposals/approve`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ proposal_id: propBody.proposal.id }),
    });
    expect(approve.status).toBe(200);
    const appBody = (await approve.json()) as { entry_id: string };
    expect(appBody.entry_id).toMatch(/^JE-/);
  });
});
