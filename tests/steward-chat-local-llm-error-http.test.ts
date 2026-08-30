import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import { llmWorkersConfigSchema } from "../schemas/llm-workers.js";
import {
  setLlmPoolConfigOverride,
  resetLlmPoolRouterForTests,
} from "../src/lib/llm-pool/router.js";

/**
 * ADR 0061: when a local worker lacks the facts, the answer must be a single
 * `ERROR: <reason>` line — not a hedge, not a refusal essay. The unit tests
 * cover the enforcement function; this one proves the rule survives the whole
 * HTTP round trip with a real (stubbed) local worker on the other end.
 */
describe("steward chat local LLM ERROR fallback over HTTP", () => {
  let handle: StewardChatServerHandle | undefined;
  let stub: Server | undefined;
  let baseUrl = "";
  let stubUrl = "";
  let stubReply = "";
  const env = { ...process.env };

  beforeEach(async () => {
    setTenantId("demo");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    process.env.ORGOS_CSRF = "0";
    process.env.ORGOS_LLM_API_KEY = "test-key";
    process.env.ORGOS_LLM_TELEMETRY = "0";
    delete process.env.ORGOS_LLM_MOCK;
    delete process.env.ORGOS_LOCAL_LLM_ERROR_FALLBACK;

    stub = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: stubReply } }],
          }),
        );
      });
    });
    await new Promise<void>((resolve) => stub!.listen(0, "127.0.0.1", resolve));
    const addr = stub.address();
    stubUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/v1`;

    setLlmPoolConfigOverride(
      llmWorkersConfigSchema.parse({
        schema: "orgos.llm.workers.v1",
        workers: [
          {
            id: "local-stub",
            label: "local-stub",
            tier: "local",
            provider: "openai-compatible",
            base_url: stubUrl,
            model: "test-local",
            max_inflight: 1,
            enabled: true,
            api_key_env: "",
          },
        ],
      }),
    );

    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    await new Promise<void>((resolve) => {
      if (!stub) return resolve();
      stub.close(() => resolve());
      stub = undefined;
    });
    setLlmPoolConfigOverride(null);
    resetLlmPoolRouterForTests();
    process.env = { ...env };
  });

  async function login(): Promise<string> {
    const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passkey: "test-pass",
        operator_id: "OP-001",
        approver_id: "OP-001",
      }),
    });
    expect(res.status, await res.text()).toBe(200);
    return res.headers.get("set-cookie") ?? "";
  }

  async function ask(cookie: string, message: string): Promise<string> {
    const res = await fetch(`${baseUrl}/chat/v1/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ message }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as { reply?: string; message?: string };
    return String(body.reply ?? body.message ?? "");
  }

  // A question the deterministic command router cannot answer, so the request
  // actually reaches the worker instead of being served from the ledger.
  const FREE_FORM = "この会社の来期の戦略について所感を述べてください";

  it("refuses to reach the worker at all without a session", async () => {
    const res = await fetch(`${baseUrl}/chat/v1/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: FREE_FORM }),
    });
    expect([401, 403]).toContain(res.status);
  });

  it("collapses a refusal essay from a local worker into one ERROR line", async () => {
    stubReply =
      "申し訳ありませんが、その情報は未確認です。提供された文脈には該当のデータが含まれておらず、" +
      "正確な回答を差し上げることができません。追加の資料をご用意いただければ幸いです。";
    const cookie = await login();
    const reply = await ask(cookie, FREE_FORM);
    expect(reply.startsWith("ERROR:"), reply).toBe(true);
    expect(reply.trim().split("\n")).toHaveLength(1);
  });

  it("passes a well-formed ERROR line through untouched", async () => {
    stubReply = "ERROR: 売上台帳に該当期間の記録がありません";
    const cookie = await login();
    const reply = await ask(cookie, FREE_FORM);
    expect(reply.trim()).toBe(stubReply);
  });

  it("leaves a grounded answer alone", async () => {
    stubReply = "承認待ちは 1 件です。";
    const cookie = await login();
    const reply = await ask(cookie, FREE_FORM);
    expect(reply).toContain("承認待ちは 1 件です。");
    expect(reply.startsWith("ERROR:")).toBe(false);
  });

  it("keeps the cloud grounding wording when the fallback is switched off", async () => {
    process.env.ORGOS_LOCAL_LLM_ERROR_FALLBACK = "0";
    stubReply = "その情報は未確認です。";
    const cookie = await login();
    const reply = await ask(cookie, FREE_FORM);
    expect(reply.startsWith("ERROR:")).toBe(false);
  });
});
