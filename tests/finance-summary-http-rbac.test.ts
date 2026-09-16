import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import {
  registerSession,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";
import { buildSecretaryWorkbench } from "../src/lib/secretary-workbench/build-workbench.js";

const SYNTHETIC_CASH = 42_000_000;
const SYNTHETIC_RUNWAY = 7.5;

vi.mock("../src/lib/steward-chat/today-context.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/steward-chat/today-context.js")>();
  return {
    ...actual,
    buildTodayContext: vi.fn(() => ({
      report_date: "2026-09-16",
      company_name: "Synthetic Fixture Co",
      tenant: "_fixture-books",
      approvals: [],
      escalate_pending_count: 0,
      kpis: [],
      mail_intake_pending_count: 0,
      mail_intake_action_required_count: 0,
      mail_intake_pending: [],
      sender_identification_pending_count: 0,
      sender_identification_pending: [],
      ceo_inline_questions_pending_count: 0,
      ceo_inline_questions_pending: [],
      scheduling_cases_active_count: 0,
      scheduling_cases_action_count: 0,
      scheduling_cases_pending: [],
      agent_coo_relay_count: 0,
      agent_coo_relay: [],
      agent_steward_inbox_count: 0,
      agent_steward_inbox: [],
      agent_summary_paths: [],
      agent_roster_configured: false,
      agent_roster_operational_count: 0,
      agent_roster_developer_count: 0,
      agent_roster_operational: [],
      agent_roster_developer: [],
      hospitality_ops_due: [],
      wire_pending: [],
      finance_cash_balance: SYNTHETIC_CASH,
      finance_runway_months: SYNTHETIC_RUNWAY,
      finance_burn_rate: 12_000,
      finance_basis_month: "2026-08",
      finance_cash_flow_mode: "deficit" as const,
      finance_metrics_source: "synthetic-http-rbac",
    })),
  };
});

describe("finance summary HTTP boundary", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("_fixture-books");
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

  it("omits finance fields from secretary workbench for every seat", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/secretary/workbench`, {
      headers: { Cookie: cookieFor("OP-001") },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      company: Record<string, unknown>;
      mail: Array<Record<string, unknown>>;
      drafts: Array<Record<string, unknown>>;
    };
    expect(body.company).not.toHaveProperty("cash_balance");
    expect(body.company).not.toHaveProperty("runway_months");
    for (const row of body.mail) {
      expect(row).not.toHaveProperty("body");
      expect(row).toHaveProperty("subject");
      expect(row).toHaveProperty("from_label");
    }
    for (const row of body.drafts) {
      expect(row).not.toHaveProperty("body");
      expect(row).toHaveProperty("subject");
      expect(row).toHaveProperty("to_label");
    }
  });

  it("redacts Today finance KPIs for readonly seats", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/today`, {
      headers: { Cookie: cookieFor("OP-READONLY") },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      finance_cash_balance: number | null | undefined;
      finance_runway_months: number | null | undefined;
      finance_burn_rate?: number;
    };
    expect(body.finance_cash_balance).toBeNull();
    expect(body.finance_runway_months).toBeNull();
    expect(body.finance_burn_rate).toBeUndefined();
  });

  it("returns synthetic Today finance KPIs for ceo seats", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/today`, {
      headers: { Cookie: cookieFor("OP-001") },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      finance_cash_balance: number | null | undefined;
      finance_runway_months: number | null | undefined;
      finance_burn_rate?: number;
    };
    expect(body.finance_cash_balance).toBe(SYNTHETIC_CASH);
    expect(body.finance_runway_months).toBe(SYNTHETIC_RUNWAY);
    expect(body.finance_burn_rate).toBe(12_000);
  });

  it("redacts executive home finance for readonly and keeps it for ceo", async () => {
    await start();
    const readonlyRes = await fetch(`${baseUrl}/chat/v1/executive/home`, {
      headers: { Cookie: cookieFor("OP-READONLY") },
    });
    expect(readonlyRes.status).toBe(200);
    const readonlyBody = (await readonlyRes.json()) as {
      finance_cash_balance: number | null;
      finance_runway_months: number | null;
    };
    expect(readonlyBody.finance_cash_balance).toBeNull();
    expect(readonlyBody.finance_runway_months).toBeNull();

    const ceoRes = await fetch(`${baseUrl}/chat/v1/executive/home`, {
      headers: { Cookie: cookieFor("OP-001") },
    });
    expect(ceoRes.status).toBe(200);
    const ceoBody = (await ceoRes.json()) as {
      finance_cash_balance: number | null;
      finance_runway_months: number | null;
    };
    expect(ceoBody.finance_cash_balance).toBe(SYNTHETIC_CASH);
    expect(ceoBody.finance_runway_months).toBe(SYNTHETIC_RUNWAY);
  });
});

describe("secretary workbench schema boundary", () => {
  it("never embeds cash or runway on the company object", () => {
    setTenantId("demo");
    const wb = buildSecretaryWorkbench();
    expect(wb.company).not.toHaveProperty("cash_balance");
    expect(wb.company).not.toHaveProperty("runway_months");
  });
});
