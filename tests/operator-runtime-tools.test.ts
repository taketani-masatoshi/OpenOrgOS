import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { executeOperatorTool, listOperatorToolDefinitions } from "../src/lib/operator-runtime/tools.js";
import { getWorkspaceRoot, resolveTenantPath, setTenantId } from "../src/lib/tenant.js";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";
import {
  ensureIssuer,
  issueGrant,
  keygenAgent,
  setFsGuardPathsForTests,
  sha256Hex,
} from "../src/lib/org/fs-guard/index.js";
import {
  makeFsGuardPathsForTests,
  removeFsGuardPathsForTests,
} from "./helpers/fs-guard-store-fixture.js";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

describe("operator runtime tools", () => {
  const env = { ...process.env };
  const snapshots = new Map<string, string | undefined>();

  beforeEach(() => {
    setTenantId("demo");
    clearOperatorsRegistryCacheForTests();
    process.env.ORGOS_LLM_TOOLS_WRITE = "0";
  });

  afterEach(() => {
    for (const [path, content] of snapshots) {
      if (content === undefined) {
        rmSync(path, { force: true });
      } else {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, "utf-8");
      }
    }
    snapshots.clear();
    process.env = { ...env };
    clearOperatorsRegistryCacheForTests();
  });

  it("lists read-only tools by default", () => {
    const names = listOperatorToolDefinitions().map((t) => t.function.name);
    expect(names).toContain("operator_today");
    expect(names).toContain("operator_validate_status");
    expect(names).toContain("operator_list_approvals");
    expect(names).not.toContain("operator_approve");
  });

  it("exposes operator_guard_apply without ORGOS_LLM_TOOLS_WRITE", () => {
    process.env.ORGOS_LLM_TOOLS_WRITE = "0";
    const names = listOperatorToolDefinitions().map((t) => t.function.name);
    expect(names).toContain("operator_guard_apply");
    expect(names).not.toContain("operator_approve");

    const operatorNames = listOperatorToolDefinitions({ operatorId: "OP-002" }).map(
      (t) => t.function.name
    );
    expect(operatorNames).toContain("operator_guard_apply");

    const approverNames = listOperatorToolDefinitions({ operatorId: "OP-003" }).map(
      (t) => t.function.name
    );
    expect(approverNames).not.toContain("operator_guard_apply");
  });

  it("rejects operator_guard_apply without CAS expected_sha256", async () => {
    const denied = await executeOperatorTool(
      "operator_guard_apply",
      JSON.stringify({
        agent: "finance",
        path: "docs/reports/agent-summaries/finance/note.md",
        content: "nope\n",
      }),
      { operatorId: "OP-002" }
    );
    expect(denied.ok).toBe(false);
    expect(denied.content).toMatch(/expected_sha256/);
  });

  it("rejects operator_guard_apply without agent:dispatch", async () => {
    const denied = await executeOperatorTool(
      "operator_guard_apply",
      JSON.stringify({
        agent: "finance",
        path: "docs/reports/agent-summaries/finance/note.md",
        content: "nope\n",
      }),
      { operatorId: "OP-003" }
    );
    expect(denied.ok).toBe(false);
    expect(denied.content).toContain("agent:dispatch");
  });

  it("applies operator_guard_apply and appends fs-guard-applies audit", async () => {
    const guardStore = makeFsGuardPathsForTests("orgos-guard-apply-tool-");
    setFsGuardPathsForTests(guardStore);
    ensureIssuer(guardStore);
    keygenAgent("finance", { paths: guardStore });
    issueGrant({
      agentId: "finance",
      op: "write",
      pathPattern: "docs/reports/agent-summaries/finance/**",
      issuedBy: "test",
      paths: guardStore,
    });
    const rel = "docs/reports/agent-summaries/finance/_operator-guard-apply.md";
    const abs = resolveTenantPath(rel);
    const content = "via tool\n";
    snapshots.set(abs, existsSync(abs) ? readFileSync(abs, "utf-8") : undefined);
    try {
      const result = await executeOperatorTool(
        "operator_guard_apply",
        JSON.stringify({
          agent: "finance",
          path: rel,
          content,
          expected_sha256: sha256Hex(""),
        }),
        { operatorId: "OP-002" }
      );
      expect(result.ok).toBe(true);
      expect(existsSync(abs)).toBe(true);
      expect(readFileSync(abs, "utf-8")).toBe(content);
      expect(readFileSync(guardStore.appliesPath, "utf-8")).toContain(rel);
    } finally {
      setFsGuardPathsForTests(undefined);
      removeFsGuardPathsForTests(guardStore);
    }
  });

  it("never includes operator_approve, even when write is enabled for a CEO", () => {
    process.env.ORGOS_LLM_TOOLS_WRITE = "1";
    const names = listOperatorToolDefinitions().map((t) => t.function.name);
    expect(names).not.toContain("operator_approve");

    const ceoNames = listOperatorToolDefinitions({ operatorId: "OP-001" }).map(
      (t) => t.function.name
    );
    expect(ceoNames).toContain("operator_generate_cashflow");
    expect(ceoNames).not.toContain("operator_approve");
  });

  it("filters context-sensitive tools by registry permissions", () => {
    process.env.ORGOS_LLM_TOOLS_WRITE = "1";
    const operatorNames = listOperatorToolDefinitions({ operatorId: "OP-002" }).map(
      (t) => t.function.name
    );
    expect(operatorNames).toContain("operator_generate_cashflow");
    expect(operatorNames).not.toContain("operator_approve");
  });

  it("rejects operator_approve for every operator, including CEO", async () => {
    process.env.ORGOS_LLM_TOOLS_WRITE = "1";
    const missing = await executeOperatorTool(
      "operator_approve",
      JSON.stringify({ approval_id: "NOTICE-NOT-EXECUTED" })
    );
    const operator = await executeOperatorTool(
      "operator_approve",
      JSON.stringify({ approval_id: "NOTICE-NOT-EXECUTED" }),
      { operatorId: "OP-002", approverId: "Demo CEO" }
    );
    const ceo = await executeOperatorTool(
      "operator_approve",
      JSON.stringify({ approval_id: "NOTICE-NOT-EXECUTED" }),
      { operatorId: "OP-001", approverId: "Demo CEO" }
    );
    expect(missing.ok).toBe(false);
    expect(operator.ok).toBe(false);
    expect(ceo.ok).toBe(false);
    expect(ceo.content).toMatch(/cannot approve/i);
  });

  it("allows cashflow preview with chat:ask and returns only an L1 summary", async () => {
    const result = await executeOperatorTool(
      "operator_generate_cashflow",
      JSON.stringify({
        granularity: "weekly",
        horizon: "4w",
        format: "json",
        write: false,
      }),
      { operatorId: "OP-002" }
    );
    expect(result.ok).toBe(true);
    const payload = JSON.parse(result.content) as Record<string, unknown>;
    expect(payload.path).toMatch(
      /^tenants\/demo\/docs\/finance\/treasury\/cashflow-schedule\//
    );
    expect(payload).toHaveProperty("required_funding_amount");
    expect(payload).toHaveProperty("required_funding_by_date");
    expect(result.content).not.toMatch(/account_id|BANK-\d+|opening_balance|rows/);
  });

  it("denies cashflow write without git:write and allows an authorized CEO", async () => {
    process.env.ORGOS_LLM_TOOLS_WRITE = "1";
    const args = JSON.stringify({
      granularity: "weekly",
      horizon: "4w",
      format: "csv",
      write: true,
    });
    const denied = await executeOperatorTool(
      "operator_generate_cashflow",
      args,
      { operatorId: "OP-002" }
    );
    expect(denied.ok).toBe(false);
    expect(denied.content).toContain("git:write");

    const preview = await executeOperatorTool(
      "operator_generate_cashflow",
      args.replace('"write":true', '"write":false'),
      { operatorId: "OP-001" }
    );
    const repoPath = JSON.parse(preview.content).path as string;
    const absolutePath = resolve(getWorkspaceRoot(), repoPath);
    snapshots.set(
      absolutePath,
      existsSync(absolutePath) ? readFileSync(absolutePath, "utf-8") : undefined
    );

    const allowed = await executeOperatorTool(
      "operator_generate_cashflow",
      args,
      { operatorId: "OP-001" }
    );
    expect(allowed.ok).toBe(true);
    expect(existsSync(absolutePath)).toBe(true);
    expect(allowed.content).not.toMatch(/account_id|BANK-\d+|opening_balance|rows/);
  });

  it("executes operator_today", async () => {
    const result = await executeOperatorTool("operator_today", "{}");
    expect(result.ok).toBe(true);
    expect(result.content).toContain("Today");
  });

  it("requires chat:read for validate status and returns only safe report fields", async () => {
    const denied = await executeOperatorTool("operator_validate_status", "{}");
    expect(denied.ok).toBe(false);
    expect(denied.content).toContain("chat:read");

    const result = await executeOperatorTool(
      "operator_validate_status",
      "{}",
      { operatorId: "OP-002" }
    );
    expect(result.ok).toBe(true);
    const payload = JSON.parse(result.content) as {
      ok: boolean;
      error_count: number;
      warning_count: number;
      issues: Array<{ path: string; message: string }>;
    };
    expect(typeof payload.error_count).toBe("number");
    expect(typeof payload.warning_count).toBe("number");
    expect(payload.issues.every((issue) => !issue.path.startsWith("/"))).toBe(true);
    expect(result.content).not.toMatch(/\b\d{7,}\b/);
  });
});

describe("operator runtime tool loop", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.ORGOS_LLM_API_KEY = "test-key";
    process.env.ORGOS_LLM_API_URL = "https://llm.example/v1";
    process.env.ORGOS_LLM_MODEL = "test-model";
    process.env.ORGOS_LLM_STRUCTURED = "0";
    delete process.env.ORGOS_LLM_MOCK;
    setTenantId("demo");
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("runs tool_calls loop then returns assistant text", async () => {
    const { runLlmWithTools } = await import("../src/lib/operator-runtime/tool-loop.js");
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          return {
            ok: true,
            text: async () =>
              JSON.stringify({
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: "",
                      tool_calls: [
                        {
                          id: "call_1",
                          type: "function",
                          function: {
                            name: "operator_list_approvals",
                            arguments: "{}",
                          },
                        },
                      ],
                    },
                  },
                ],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
              }),
          };
        }
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              choices: [{ message: { role: "assistant", content: "承認待ちを確認しました。" } }],
              usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
            }),
        };
      })
    );

    const result = await runLlmWithTools("system", "承認待ちは？");
    expect(result.ok).toBe(true);
    expect(result.tool_calls).toBe(1);
    expect(result.content).toContain("承認");
    expect(result.usage.total_tokens).toBe(45);
  });

  it("supports one plain inference with tools and structured retry disabled", async () => {
    process.env.ORGOS_LLM_STRUCTURED = "1";
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        tools?: unknown[];
        response_format?: unknown;
      };
      expect(body.tools).toBeUndefined();
      expect(body.response_format).toBeUndefined();
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "検索結果を確認しました。",
                },
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { runLlmWithTools } = await import("../src/lib/operator-runtime/tool-loop.js");
    const result = await runLlmWithTools("system", "最新情報は？", undefined, {}, undefined, {
      allowTools: false,
      allowStructuredOutput: false,
    });

    expect(result.ok).toBe(true);
    expect(result.tool_calls).toBe(0);
    expect(result.structured).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("propagates operator context through the tool loop", async () => {
    let call = 0;
    let toolResultContent = "";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url, init) => {
        call += 1;
        if (call === 1) {
          return {
            ok: true,
            text: async () =>
              JSON.stringify({
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: "",
                      tool_calls: [
                        {
                          id: "call_cashflow",
                          type: "function",
                          function: {
                            name: "operator_generate_cashflow",
                            arguments: JSON.stringify({
                              granularity: "weekly",
                              horizon: "4w",
                              format: "json",
                              write: false,
                            }),
                          },
                        },
                      ],
                    },
                  },
                ],
              }),
          };
        }
        const body = JSON.parse(String(init?.body)) as {
          messages: Array<{ role: string; content: string }>;
        };
        toolResultContent =
          body.messages.find((message) => message.role === "tool")?.content ?? "";
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              choices: [{ message: { role: "assistant", content: "確認しました。" } }],
            }),
        };
      })
    );

    const { runLlmWithTools } = await import("../src/lib/operator-runtime/tool-loop.js");
    const result = await runLlmWithTools(
      "system",
      "資金繰りを確認",
      undefined,
      { operatorId: "OP-002" }
    );
    expect(result.ok).toBe(true);
    expect(toolResultContent).toContain("preview generated");
    expect(toolResultContent).not.toContain("lacks chat:ask");
  });
});
