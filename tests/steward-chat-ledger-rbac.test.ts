import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, beforeEach } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  registerSession,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";
import { appendJournalEntry } from "../src/lib/finance/expense-claim-journal.js";
import { postPayrollJournalEntry } from "../src/lib/finance/journal-sources.js";
import { resetFixtureJournalEntries } from "./helpers/finance-fixture.js";
import { getPendingApprovalsPath } from "../src/lib/org/paths.js";

describe("steward chat ledger workbench api", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("_fixture-books");
    resetFixtureJournalEntries();
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    resetFixtureJournalEntries();
    process.env = { ...env };
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

  it("requires a reason to unlock a month and audits lock / unlock", async () => {
    const auditPath = join(getDataDir(), ".orgos", "chat-audit-period-test.jsonl");
    rmSync(auditPath, { force: true });
    process.env.ORGOS_CHAT_AUDIT = "1";
    process.env.ORGOS_CHAT_AUDIT_LOG = auditPath;
    await start();
    const headers = {
      Cookie: cookieFor("OP-001"),
      "Content-Type": "application/json",
    };

    const lock = await fetch(`${baseUrl}/chat/v1/ledger/period`, {
      method: "POST",
      headers,
      body: JSON.stringify({ month: "2026-08", action: "lock" }),
    });
    expect(lock.status).toBe(200);

    const noReason = await fetch(`${baseUrl}/chat/v1/ledger/period`, {
      method: "POST",
      headers,
      body: JSON.stringify({ month: "2026-08", action: "unlock" }),
    });
    expect(noReason.status).toBe(422);

    const unlock = await fetch(`${baseUrl}/chat/v1/ledger/period`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        month: "2026-08",
        action: "unlock",
        reason: "監査対応で再計上",
      }),
    });
    expect(unlock.status).toBe(200);

    const lines = readFileSync(auditPath, "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { action: string; detail?: string });
    expect(lines.some((l) => l.action === "ledger_period_lock")).toBe(true);
    const unlocked = lines.find((l) => l.action === "ledger_period_unlock");
    expect(unlocked?.detail).toContain("監査対応で再計上");
    rmSync(auditPath, { force: true });
  });

  it("returns 401 without session", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/ledger/workbench`);
    expect(res.status).toBe(401);
  });

  it("allows chat:read users to GET ledger workbench", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/ledger/workbench?as_of=2026-09-30`, {
      headers: { Cookie: cookieFor("OP-READONLY") },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      as_of: string;
      trial_balance: { balanced: boolean; rows: unknown[] };
      balance_sheet: { balanced: boolean };
      period_locks: unknown[];
      monthly_reconcile: { month: string; balanced: boolean };
    };
    expect(body.as_of).toBe("2026-09-30");
    expect(body.trial_balance.rows.length).toBeGreaterThan(0);
    expect(body.balance_sheet.balanced).toBe(true);
    expect(Array.isArray(body.period_locks)).toBe(true);
    expect(body.monthly_reconcile.month).toBe("2026-09");
    const withExport = body as {
      export_urls: {
        journal_csv: string;
        trial_balance_csv: string;
        account_breakdown_csv: string;
      };
      dencho_search_path: string;
    };
    expect(withExport.export_urls.journal_csv).toContain("/chat/v1/ledger/export");
    expect(withExport.dencho_search_path).toContain("/chat/v1/ledger/dencho/search");
  });

  it("allows chat:read users to export ledger CSV", async () => {
    await start();
    const res = await fetch(
      `${baseUrl}/chat/v1/ledger/export?template=journal-csv&as_of=2026-09-30`,
      { headers: { Cookie: cookieFor("OP-READONLY") } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const body = await res.text();
    expect(body).toContain("entry_id");
  });

  it("allows chat:read users to search electronic ledger", async () => {
    await start();
    appendJournalEntry({
      entry_id: "JE-DENCHO-HTTP",
      occurred_at: "2026-09-12T00:00:00.000Z",
      description: "http dencho probe",
      posted_at: "2026-09-12T10:00:00.000Z",
      posted_by: "OP-001",
      source: { kind: "manual", authorized_by: "OP-001" },
      evidence_refs: ["test:dencho-http"],
      lines: [
        { account_code: "5100", debit_yen: 2000, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "1100", debit_yen: 0, credit_yen: 2000, tax_category: "out_of_scope" },
      ],
    });
    const res = await fetch(
      `${baseUrl}/chat/v1/ledger/dencho/search?from=2026-09-01&to=2026-09-30&description=http`,
      { headers: { Cookie: cookieFor("OP-READONLY") } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number; hits: Array<{ entry_id: string }> };
    expect(body.count).toBeGreaterThan(0);
    expect(body.hits.some((h) => h.entry_id === "JE-DENCHO-HTTP")).toBe(true);
  });

  it("allows chat:read users to check electronic ledger compliance", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/ledger/dencho/check`, {
      headers: { Cookie: cookieFor("OP-READONLY") },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; entry_count: number; issues: string[] };
    expect(body.ok).toBe(true);
    expect(body.entry_count).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects ledger mutations without finance:reconcile", async () => {
    await start();
    const headers = {
      Cookie: cookieFor("OP-READONLY"),
      "Content-Type": "application/json",
    };
    const reverse = await fetch(`${baseUrl}/chat/v1/ledger/reverse`, {
      method: "POST",
      headers,
      body: JSON.stringify({ entry_id: "JE-NONE" }),
    });
    expect(reverse.status).toBe(403);
    const period = await fetch(`${baseUrl}/chat/v1/ledger/period`, {
      method: "POST",
      headers,
      body: JSON.stringify({ month: "2026-09", action: "lock" }),
    });
    expect(period.status).toBe(403);
    const remit = await fetch(`${baseUrl}/chat/v1/ledger/remittance`, {
      method: "POST",
      headers,
      body: JSON.stringify({ period: "2026-09", obligation: "withholding" }),
    });
    expect(remit.status).toBe(403);
  });

  it("allows finance:reconcile to reverse, lock, remit, post, and settle", async () => {
    await start();
    appendJournalEntry({
      entry_id: "JE-LEDGER-API-001",
      occurred_at: "2026-09-10T00:00:00.000Z",
      description: "api reverse seed",
      source: { kind: "manual", authorized_by: "OP-001" },
      evidence_refs: ["test:ledger-api"],
      lines: [
        { account_code: "5300", debit_yen: 100, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "1100", debit_yen: 0, credit_yen: 100, tax_category: "out_of_scope" },
      ],
    });
    postPayrollJournalEntry({
      period: "2026-09",
      authorizedBy: "OP-001",
      grossYen: 50000,
      withholdingYen: 5000,
      socialEmployerYen: 7500,
    });

    const headers = {
      Cookie: cookieFor("OP-001"),
      "Content-Type": "application/json",
    };

    const reverse = await fetch(`${baseUrl}/chat/v1/ledger/reverse`, {
      method: "POST",
      headers,
      body: JSON.stringify({ entry_id: "JE-LEDGER-API-001" }),
    });
    expect(reverse.status).toBe(200);

    const lock = await fetch(`${baseUrl}/chat/v1/ledger/period`, {
      method: "POST",
      headers,
      body: JSON.stringify({ month: "2026-09", action: "lock" }),
    });
    expect(lock.status).toBe(200);

    const unlock = await fetch(`${baseUrl}/chat/v1/ledger/period`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        month: "2026-09",
        action: "unlock",
        reason: "test unlock",
      }),
    });
    expect(unlock.status).toBe(200);

    const remit = await fetch(`${baseUrl}/chat/v1/ledger/remittance`, {
      method: "POST",
      headers,
      body: JSON.stringify({ period: "2026-09", obligation: "withholding" }),
    });
    expect(remit.status).toBe(200);
    expect(((await remit.json()) as { settled: boolean }).settled).toBe(true);

    const post = await fetch(`${baseUrl}/chat/v1/ledger/post`, {
      method: "POST",
      headers,
      body: JSON.stringify({ source: "monthly-pl", month: "2026-09" }),
    });
    expect(post.status).toBe(200);

    const settle = await fetch(`${baseUrl}/chat/v1/ledger/settle`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        kind: "ar-receipt",
        counterparty_id: "PROP-001",
        amount_yen: 1000,
        month: "2026-09",
      }),
    });
    expect(settle.status).toBe(200);

    const pay = await fetch(`${baseUrl}/chat/v1/ledger/post`, {
      method: "POST",
      headers,
      body: JSON.stringify({ source: "payroll-payment", month: "2026-09" }),
    });
    expect(pay.status).toBe(200);
  });

  it("exposes tax calendar and filing gaps to chat:read", async () => {
    await start();
    const headers = { Cookie: cookieFor("OP-READONLY") };
    const cal = await fetch(`${baseUrl}/chat/v1/tax/calendar?today=2026-08-29`, { headers });
    expect(cal.status).toBe(200);
    const calBody = (await cal.json()) as { ok: boolean; rows: unknown[]; stats: { open: number } };
    expect(calBody.ok).toBe(true);
    expect(Array.isArray(calBody.rows)).toBe(true);
    expect(typeof calBody.stats.open).toBe("number");

    const gaps = await fetch(`${baseUrl}/chat/v1/tax/gaps`, { headers });
    expect(gaps.status).toBe(200);
    const gapBody = (await gaps.json()) as { ok: boolean; total: number; items: unknown[] };
    expect(gapBody.ok).toBe(true);
    expect(Array.isArray(gapBody.items)).toBe(true);
  });

  it("lets chat:ask propose an internal approval and forbids readonly", async () => {
    await start();
    const pendingPath = getPendingApprovalsPath();
    const existed = existsSync(pendingPath);
    const snapshot = existed ? readFileSync(pendingPath, "utf8") : null;
    try {
      const forbidden = await fetch(`${baseUrl}/chat/v1/approvals/propose`, {
        method: "POST",
        headers: {
          Cookie: cookieFor("OP-READONLY"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ subject_type: "org.internal", message: "readonly must fail" }),
      });
      expect(forbidden.status).toBe(403);

      const ok = await fetch(`${baseUrl}/chat/v1/approvals/propose`, {
        method: "POST",
        headers: {
          Cookie: cookieFor("OP-001"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject_type: "org.internal",
          subject_ref: "CTR-TEST",
          message: "console propose wiring",
          amount: 50000,
        }),
      });
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as {
        ok: boolean;
        approval: { approval_id: string; status: string; subject_type: string };
      };
      expect(body.ok).toBe(true);
      expect(body.approval.status).toBe("pending_approval");
      expect(body.approval.subject_type).toBe("org.internal");
      expect(body.approval.approval_id).toMatch(/^APR-\d{8}-\d{3}$/);
    } finally {
      if (snapshot != null) writeFileSync(pendingPath, snapshot);
      else rmSync(pendingPath, { force: true });
    }
  });

  it("exposes consumption assessment, payroll calc, contracts, and hospitality ops-due", async () => {
    await start();
    const readHeaders = { Cookie: cookieFor("OP-READONLY") };
    const consumption = await fetch(`${baseUrl}/chat/v1/tax/consumption`, {
      headers: readHeaders,
    });
    expect(consumption.status).toBe(200);
    const ct = (await consumption.json()) as { ok: boolean; status: string; issues: unknown[] };
    expect(ct.ok).toBe(true);
    expect(typeof ct.status).toBe("string");

    const contracts = await fetch(`${baseUrl}/chat/v1/contracts/status`, {
      headers: readHeaders,
    });
    expect(contracts.status).toBe(200);
    const cbody = (await contracts.json()) as { ok: boolean; total: number; by_status: unknown };
    expect(cbody.ok).toBe(true);
    expect(typeof cbody.total).toBe("number");

    const stays = await fetch(`${baseUrl}/chat/v1/hospitality/ops-due`, {
      headers: readHeaders,
    });
    expect(stays.status).toBe(200);
    const sbody = (await stays.json()) as {
      ok: boolean;
      module_enabled: boolean;
      stay_count: number;
      due: unknown[];
    };
    expect(sbody.ok).toBe(true);
    expect(Array.isArray(sbody.due)).toBe(true);

    const forbidden = await fetch(`${baseUrl}/chat/v1/tax/payroll-calc`, {
      method: "POST",
      headers: {
        Cookie: cookieFor("OP-READONLY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ month: "2026-08", gross_yen: 300000 }),
    });
    expect(forbidden.status).toBe(403);

    const calc = await fetch(`${baseUrl}/chat/v1/tax/payroll-calc`, {
      method: "POST",
      headers: {
        Cookie: cookieFor("OP-001"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ month: "2026-08", gross_yen: 300000, dependents: 0 }),
    });
    expect(calc.status).toBe(200);
    const run = (await calc.json()) as {
      ok: boolean;
      run: { net_pay_yen: number; withholding_yen: number };
    };
    expect(run.ok).toBe(true);
    expect(run.run.net_pay_yen).toBeLessThanOrEqual(300000);
  });

  it("gates mail connect on chat:approve and returns a Community connect URL", async () => {
    await start();
    const bindPath = join(getDataDir(), "protocol", "community-gmail-bind.yaml");
    try {
      const denied = await fetch(`${baseUrl}/chat/v1/mail/gmail/connect`, {
        method: "POST",
        headers: { Cookie: cookieFor("OP-READONLY"), "Content-Type": "application/json" },
        body: "{}",
      });
      expect(denied.status).toBe(403);

      const allowed = await fetch(`${baseUrl}/chat/v1/mail/gmail/connect`, {
        method: "POST",
        headers: { Cookie: cookieFor("OP-001"), "Content-Type": "application/json" },
        body: "{}",
      });
      expect(allowed.status).toBe(200);
      const body = (await allowed.json()) as {
        ok: boolean;
        connect_url: string;
        platform_ready: boolean;
      };
      expect(body.ok).toBe(true);
      expect(body.connect_url).toContain("orgos_mail=1");
      expect(typeof body.platform_ready).toBe("boolean");
    } finally {
      rmSync(bindPath, { force: true });
    }
  });

  it("reports Gmail status without tokens and computes YEA aggregates", async () => {
    await start();
    const gmail = await fetch(`${baseUrl}/chat/v1/mail/gmail`, {
      headers: { Cookie: cookieFor("OP-READONLY") },
    });
    expect(gmail.status).toBe(200);
    const gbody = (await gmail.json()) as {
      ok: boolean;
      connected: boolean;
      expired: boolean;
      note: string;
      provider: string;
      from: { name: string; email: string };
      platform_ready: boolean;
      platform_detail: string;
      community_connections_url?: string;
    };
    expect(gbody.ok).toBe(true);
    expect(gbody.connected).toBe(false);
    expect(gbody.note.length).toBeGreaterThan(0);
    expect(gbody.from.email.length).toBeGreaterThan(0);
    expect(gbody.platform_detail.length).toBeGreaterThan(0);
    expect(gbody.community_connections_url).toContain("/settings/connections");

    const yeaPath = join(getDataDir(), "finance", "year-end-adjustment");
    try {
      const yea = await fetch(`${baseUrl}/chat/v1/tax/yea/compute`, {
        method: "POST",
        headers: {
          Cookie: cookieFor("OP-001"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fiscal_year: "FY2026" }),
      });
      expect(yea.status).toBe(200);
      const ybody = (await yea.json()) as {
        ok: boolean;
        yea: { employee_count: number; totals: { annual_gross_yen: number } };
      };
      expect(ybody.ok).toBe(true);
      expect(ybody.yea.employee_count).toBeGreaterThanOrEqual(1);
      expect(ybody.yea.totals.annual_gross_yen).toBeGreaterThan(0);
    } finally {
      if (existsSync(yeaPath)) rmSync(yeaPath, { recursive: true, force: true });
    }
  });
});
