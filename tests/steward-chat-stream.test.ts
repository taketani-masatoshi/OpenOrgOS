import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import {
  startStewardChatServer,
  type StewardChatServerHandle,
} from "../src/lib/steward-chat/server.js";
import { setTenantId } from "../src/lib/tenant.js";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/lib/utils.js";

const TEST_PORT = 19480;

describe("steward chat message stream", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };
  const schedulingSnapshots = new Map<string, string | undefined>();

  beforeEach(() => {
    setTenantId("demo");
    for (const name of ["scheduling-cases.yaml", "scheduling-chat-drafts.yaml"]) {
      const path = join(getDataDir(), "executive", name);
      schedulingSnapshots.set(path, existsSync(path) ? readFileSync(path, "utf-8") : undefined);
      if (existsSync(path)) rmSync(path);
    }
    process.env.STEWARD_CHAT_AUTH = "0";
    process.env.ORGOS_LLM_MOCK = "1";
    process.env.ORGOS_CSRF = "0";
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    for (const [path, content] of schedulingSnapshots) {
      if (content === undefined) {
        if (existsSync(path)) rmSync(path);
      } else {
        writeFileSync(path, content, "utf-8");
      }
    }
    schedulingSnapshots.clear();
    process.env = { ...env };
  });

  it("streams SSE deltas and done event", async () => {
    process.env.ORGOS_LLM_STRUCTURED = "1";
    process.env.ORGOS_LLM_TELEMETRY = "1";
    handle = startStewardChatServer({ host: "127.0.0.1", port: TEST_PORT });
    baseUrl = handle.url;

    const res = await fetch(`${baseUrl}/chat/v1/message/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "テスト質問" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const text = await res.text();
    expect(text).toContain('"type":"delta"');
    expect(text).toContain('"type":"done"');
    expect(text).toContain("モック");
    expect(text).toContain('"structured"');
    expect(text).toContain('"telemetry"');
  });

  it("handles scheduling collection in non-streaming and streaming routes", async () => {
    handle = startStewardChatServer({ host: "127.0.0.1", port: TEST_PORT });
    baseUrl = handle.url;

    const first = await fetch(`${baseUrl}/chat/v1/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "役員会の日程調整をお願い" }),
    });
    const firstBody = (await first.json()) as {
      structured: { missing_information: boolean; scheduling_draft_status: string };
    };
    expect(firstBody.structured).toMatchObject({
      missing_information: true,
      scheduling_draft_status: "collecting",
    });

    const second = await fetch(`${baseUrl}/chat/v1/message/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          "参加者は Alice <alice@example.com>、Bob <bob@example.com>、60分、オンライン",
      }),
    });
    const text = await second.text();
    expect(text).toContain('"type":"done"');
    expect(text).toContain('"scheduling_draft_status":"completed"');
    expect(text).toMatch(/SCH-\d{4}-\d{3}/);
  });
});
