import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { handoffSchema } from "../schemas/routing.js";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import { routingQueueDir, writeHandoffFiles } from "../src/lib/routing.js";
import {
  registerSession,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";

describe("steward chat orchestration runs HTTP", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };
  const created: string[] = [];

  beforeEach(() => {
    setTenantId("mal");
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
    for (const id of created) {
      for (const ext of [".yaml", ".md"]) {
        const path = join(routingQueueDir(), `${id}${ext}`);
        if (existsSync(path)) rmSync(path);
      }
      const prompt = join(routingQueueDir(), "prompts", `${id}_finance.md`);
      if (existsSync(prompt)) rmSync(prompt);
    }
    created.length = 0;
    process.env = { ...env };
  });

  async function start() {
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  }

  function cookie(): string {
    const { token } = registerSession({
      operator_id: "guest",
      approver_id: "guest-not-authorized",
      mode: "prod",
    });
    return `${WIRE_CONSOLE_SESSION_COOKIE}=${token}`;
  }

  function seed(id: string, status: "pending" | "completed" | "failed" = "pending") {
    const handoff = handoffSchema.parse({
      id,
      created_at: new Date().toISOString(),
      from_agent: "executive_steward",
      to_agent: "finance",
      task_type: "implement",
      access: { allowed: true, reason: "http test" },
      context: { text: "http test" },
      status,
      agent_prompt_path: `prompts/${id}_finance.md`,
    });
    writeHandoffFiles(handoff, undefined, { audit: false });
    mkdirSync(join(routingQueueDir(), "prompts"), { recursive: true });
    writeFileSync(join(routingQueueDir(), handoff.agent_prompt_path!), "# http", "utf-8");
    created.push(id);
  }

  it("returns 401 without session", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/orchestration/runs`);
    expect(res.status).toBe(401);
  });

  it("lists active roots and 404s unknown ids", async () => {
    seed("IMP-HTTP-ACTIVE");
    await start();
    const headers = { Cookie: cookie() };

    const list = await fetch(`${baseUrl}/chat/v1/orchestration/runs`, { headers });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { active_roots: string[]; count: number };
    expect(body.active_roots).toContain("IMP-HTTP-ACTIVE");
    expect(body.count).toBeGreaterThan(0);

    const missing = await fetch(`${baseUrl}/chat/v1/orchestration/runs?id=IMP-HTTP-MISSING`, {
      headers,
    });
    expect(missing.status).toBe(404);
  });

  it("returns a plan payload and include=completed", async () => {
    seed("IMP-HTTP-DONE", "completed");
    seed("IMP-HTTP-OPEN");
    await start();
    const headers = { Cookie: cookie() };

    const detail = await fetch(`${baseUrl}/chat/v1/orchestration/runs?id=IMP-HTTP-OPEN`, {
      headers,
    });
    expect(detail.status).toBe(200);
    const payload = (await detail.json()) as {
      ok: boolean;
      rootId: string;
      nodes: unknown[];
      retryableCount: number;
      cancellableCount: number;
    };
    expect(payload.ok).toBe(true);
    expect(payload.rootId).toBe("IMP-HTTP-OPEN");
    expect(payload.nodes.length).toBeGreaterThan(0);
    expect(payload.retryableCount).toBe(0);
    expect(payload.cancellableCount).toBeGreaterThan(0);

    const withDone = await fetch(`${baseUrl}/chat/v1/orchestration/runs?include=completed`, {
      headers,
    });
    const listed = (await withDone.json()) as {
      active_roots: string[];
      completed_roots: string[];
    };
    expect(listed.active_roots).toContain("IMP-HTTP-OPEN");
    expect(listed.completed_roots).toContain("IMP-HTTP-DONE");
  });

  it("POST retry returns 400 without id and 404 for unknown id", async () => {
    await start();
    const headers = { Cookie: cookie(), "Content-Type": "application/json" };

    const noId = await fetch(`${baseUrl}/chat/v1/orchestration/runs/retry`, {
      method: "POST",
      headers,
    });
    expect(noId.status).toBe(400);

    const missing = await fetch(`${baseUrl}/chat/v1/orchestration/runs/retry?id=IMP-HTTP-MISSING`, {
      method: "POST",
      headers,
    });
    expect(missing.status).toBe(404);
  });

  it("retries failed work orders via POST", async () => {
    seed("IMP-HTTP-FAIL", "failed");
    await start();
    const headers = { Cookie: cookie(), "Content-Type": "application/json" };
    const res = await fetch(`${baseUrl}/chat/v1/orchestration/runs/retry?id=IMP-HTTP-FAIL`, {
      method: "POST",
      headers,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; retried: string[] };
    expect(body.ok).toBe(true);
    expect(body.retried).toContain("IMP-HTTP-FAIL");
  });

  it("cancels pending work orders via POST", async () => {
    seed("IMP-HTTP-CANCEL", "pending");
    await start();
    const headers = { Cookie: cookie(), "Content-Type": "application/json" };
    const res = await fetch(`${baseUrl}/chat/v1/orchestration/runs/cancel?id=IMP-HTTP-CANCEL`, {
      method: "POST",
      headers,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; cancelled: string[] };
    expect(body.ok).toBe(true);
    expect(body.cancelled).toContain("IMP-HTTP-CANCEL");
  });
});
