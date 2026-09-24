import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  callStewardMcpTool,
  listStewardMcpTools,
  resetMcpRateLimitState,
} from "../src/lib/mcp/tools.js";
import * as ask from "../src/lib/operator-runtime/ask.js";
import * as todayContext from "../src/lib/steward-chat/today-context.js";
import * as wireWitness from "../src/lib/steward-chat/wire-witness.js";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";
import { setTenantId } from "../src/lib/tenant.js";

const TOKEN = "demo-operator-key";

describe("mcp tools dispatch (characterization)", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    clearOperatorsRegistryCacheForTests();
    process.env.ORGOS_MCP_RATE_LIMIT = "0";
    process.env.ORGOS_LLM_MOCK = "1";
    resetMcpRateLimitState();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...env };
    clearOperatorsRegistryCacheForTests();
    vi.restoreAllMocks();
  });

  it("lists the canonical steward/ledger MCP tools (~10)", () => {
    const names = listStewardMcpTools().map((t) => t.name);
    expect(names).toEqual([
      "steward_today",
      "steward_ask",
      "steward_wire_flush",
      "steward_witness_register",
      "steward_witness_verify",
      "steward_witness_flush",
      "ledger_today",
      "ledger_trial_balance",
      "ledger_propose_manual_entry",
      "ledger_propose_bank_match",
    ]);
  });

  it("steward_today reaches today-context handler", async () => {
    const build = vi.spyOn(todayContext, "buildTodayContext").mockReturnValue({} as never);
    const format = vi
      .spyOn(todayContext, "formatTodayContextMarkdown")
      .mockReturnValue("HANDLER:steward_today");

    const result = await callStewardMcpTool("steward_today", {}, { token: TOKEN });
    expect(result.isError).not.toBe(true);
    expect(result.content[0]?.text).toBe("HANDLER:steward_today");
    expect(build).toHaveBeenCalledOnce();
    expect(format).toHaveBeenCalledOnce();
  });

  it("steward_ask reaches runOperatorAsk handler", async () => {
    vi.spyOn(todayContext, "buildTodayContext").mockReturnValue({} as never);
    vi.spyOn(todayContext, "formatTodayContextMarkdown").mockReturnValue("ctx");
    const askSpy = vi.spyOn(ask, "runOperatorAsk").mockResolvedValue({
      ok: true,
      reply: "HANDLER:steward_ask",
      stdout: "",
      stderr: "",
      detail: "HANDLER:steward_ask",
      runtime: "llm-api",
    });

    const result = await callStewardMcpTool(
      "steward_ask",
      { message: "status?" },
      { token: TOKEN }
    );
    expect(result.isError).not.toBe(true);
    expect(result.content[0]?.text).toBe("HANDLER:steward_ask");
    expect(askSpy).toHaveBeenCalledOnce();
  });

  it("steward_wire_flush reaches flushWireFromChat handler", async () => {
    const flush = vi
      .spyOn(wireWitness, "flushWireFromChat")
      .mockResolvedValue({ flushed: 0, HANDLER: "steward_wire_flush" } as never);

    const result = await callStewardMcpTool("steward_wire_flush", {}, { token: TOKEN });
    expect(result.isError).not.toBe(true);
    expect(result.content[0]?.text).toContain("steward_wire_flush");
    expect(flush).toHaveBeenCalledOnce();
  });

  it("steward_witness_register reaches registerWitnessFromChat handler", async () => {
    const register = vi
      .spyOn(wireWitness, "registerWitnessFromChat")
      .mockResolvedValue({ ok: true, HANDLER: "steward_witness_register" } as never);

    const result = await callStewardMcpTool(
      "steward_witness_register",
      { event_id: "00000000-0000-4000-8000-000000000001", side: "sent" },
      { token: TOKEN }
    );
    expect(result.isError).not.toBe(true);
    expect(result.content[0]?.text).toContain("steward_witness_register");
    expect(register).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001", "sent");
  });

  it("steward_witness_verify reaches verifyWitnessFromChat handler", async () => {
    const verify = vi
      .spyOn(wireWitness, "verifyWitnessFromChat")
      .mockResolvedValue({ ok: true, HANDLER: "steward_witness_verify" } as never);

    const result = await callStewardMcpTool(
      "steward_witness_verify",
      { event_id: "00000000-0000-4000-8000-000000000001" },
      { token: TOKEN }
    );
    expect(result.isError).not.toBe(true);
    expect(result.content[0]?.text).toContain("steward_witness_verify");
    expect(verify).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
  });

  it("steward_witness_flush reaches flushWitnessPendingFromChat handler", async () => {
    const flush = vi
      .spyOn(wireWitness, "flushWitnessPendingFromChat")
      .mockResolvedValue({ flushed: 0, HANDLER: "steward_witness_flush" } as never);

    const result = await callStewardMcpTool("steward_witness_flush", {}, { token: TOKEN });
    expect(result.isError).not.toBe(true);
    expect(result.content[0]?.text).toContain("steward_witness_flush");
    expect(flush).toHaveBeenCalledOnce();
  });

  it("ledger_today reaches ledger summary handler shape", async () => {
    const result = await callStewardMcpTool("ledger_today", {}, { token: TOKEN });
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(body).toMatchObject({
      journal_count: expect.any(Number),
      bank_unmatched: expect.any(Number),
      month_close: expect.anything(),
    });
    expect(String(body.note)).toMatch(/Read-only/i);
  });

  it("ledger_trial_balance reaches trial-balance handler shape", async () => {
    const result = await callStewardMcpTool(
      "ledger_trial_balance",
      { as_of: "2024-01-01" },
      { token: TOKEN }
    );
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(body).toMatchObject({
      as_of: "2024-01-01",
      balanced: expect.any(Boolean),
      debit_total_yen: expect.any(Number),
      credit_total_yen: expect.any(Number),
      rows: expect.any(Array),
    });
  });

  it("ledger_propose_manual_entry reaches proposal queue handler", async () => {
    const result = await callStewardMcpTool(
      "ledger_propose_manual_entry",
      {
        description: "mcp-dispatch-char test",
        debit_account: "現金",
        credit_account: "売上高",
        amount_yen: 1,
      },
      { token: TOKEN }
    );
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(body.queued).toBe(true);
    expect(body.proposal).toBeTruthy();
    expect(String(body.note)).toMatch(/Workbench/i);
  });

  it("ledger_propose_bank_match reaches bank reconcile proposal handler", async () => {
    const result = await callStewardMcpTool("ledger_propose_bank_match", {}, { token: TOKEN });
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(body).toMatchObject({
      unmatched_count: expect.any(Number),
      proposals: expect.any(Array),
    });
    expect(String(body.note)).toMatch(/Proposal only/i);
  });

  it("unknown tool returns Unknown tool error", async () => {
    const result = await callStewardMcpTool("not_a_real_tool", {}, { token: TOKEN });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe("Unknown tool: not_a_real_tool");
  });

  it("steward_approve is rejected for MCP callers", async () => {
    const result = await callStewardMcpTool(
      "steward_approve",
      { approval_id: "NOTICE-X" },
      { token: TOKEN }
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/not available/i);
    expect(result.content[0]?.text).toMatch(/org approval approve/i);
  });

  it("rate-limit returns mcp_rate_limit_exceeded", async () => {
    process.env.ORGOS_MCP_RATE_LIMIT = "1";
    process.env.ORGOS_MCP_RATE_LIMIT_MAX = "1";
    resetMcpRateLimitState();

    vi.spyOn(todayContext, "buildTodayContext").mockReturnValue({} as never);
    vi.spyOn(todayContext, "formatTodayContextMarkdown").mockReturnValue("ok");

    const first = await callStewardMcpTool("steward_today", {}, { token: TOKEN });
    expect(first.isError).not.toBe(true);

    const second = await callStewardMcpTool("steward_today", {}, { token: TOKEN });
    expect(second.isError).toBe(true);
    expect(second.content[0]?.text).toBe("mcp_rate_limit_exceeded");
  });
});
