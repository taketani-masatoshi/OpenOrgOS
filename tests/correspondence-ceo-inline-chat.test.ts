import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { saveCeoInlineQueue } from "../src/lib/correspondence/ceo-inline-question.js";
import { ceoInlineQueueSchema } from "../schemas/correspondence/ceo-inline-question.js";

describe("correspondence ceo inline chat api", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    process.env.STEWARD_CHAT_AUTH = "0";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
    process.env.ORGOS_PROD = "0";
    process.env.NODE_ENV = "test";
    mkdirSync(join(getDataDir(), "executive"), { recursive: true });
    saveCeoInlineQueue(
      ceoInlineQueueSchema.parse({
        version: 1,
        questions: [
          {
            id: "CEO-Q-001",
            mail_id: "MSG-test-001",
            subject: "未知の送信者",
            context_l1: "差出人確認が必要です",
            fields: [
              { id: "note", label: "氏名・所属", type: "text" },
              { id: "reply_needed", label: "返信必要？", type: "yes_no" },
            ],
            status: "pending",
            asked_at: "2026-07-10T08:00:00.000Z",
          },
        ],
      })
    );
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    const exec = join(getDataDir(), "executive");
    if (existsSync(exec)) rmSync(exec, { recursive: true, force: true });
    process.env = { ...env };
  });

  async function start() {
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  }

  it("lists pending CEO inline questions", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/ceo-questions`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; questions: Array<{ id: string }> };
    expect(body.ok).toBe(true);
    expect(body.questions.some((q) => q.id === "CEO-Q-001")).toBe(true);
  });

  it("shows CEO inline question detail", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/ceo-questions/CEO-Q-001`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { question: { mail_id: string } };
    expect(body.question.mail_id).toBe("MSG-test-001");
  });

  it("answers CEO inline question via POST", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/ceo-questions/CEO-Q-001/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: { note: "田中太郎 · Example Inc", reply_needed: "yes" },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { question: { status: string; answers?: Record<string, string> } };
    expect(body.question.status).toBe("answered");
    expect(body.question.answers?.note).toContain("田中太郎");
  });
});
