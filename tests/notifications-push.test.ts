import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTenantId } from "../src/lib/tenant.js";
import { loadQueueEvents } from "../src/lib/queue-db.js";

describe("notifications push", () => {
  const env = { ...process.env };
  let registryPath: string;
  let registryDir: string;

  beforeEach(() => {
    setTenantId("demo");
    registryDir = join(tmpdir(), `orgos-notify-test-${Date.now()}`);
    mkdirSync(registryDir, { recursive: true });
    registryPath = join(registryDir, "registry.yaml");
    process.env.ORGOS_NOTIFICATIONS_REGISTRY = registryPath;
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
    rmSync(registryDir, { recursive: true, force: true });
  });

  function writeRegistry(yaml: string): void {
    writeFileSync(registryPath, yaml, "utf-8");
  }

  it("posts to webhook with secret header", async () => {
    writeRegistry(`version: "1"
channels:
  webhook:
    url: https://hook.example/orgos
    secret: test-secret
    events:
      - pipeline_daily_complete
`);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { pushNotifications } = await import("../src/lib/notifications/push.js");
    const { buildTodayContext } = await import("../src/lib/steward-chat/today-context.js");
    const ctx = buildTodayContext();
    const result = await pushNotifications("pipeline_daily_complete", ctx);

    expect(result.sent.some((s) => s.channel === "webhook" && s.ok)).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Steward-Secret"]).toBe("test-secret");
    const body = JSON.parse(String(init.body)) as { tenant: string; summary: string };
    expect(body.tenant).toBe("demo");
    expect(body.summary).toBeTruthy();

    const events = loadQueueEvents().filter((e) => e.type === "pipeline_daily_complete");
    expect(events.length).toBeGreaterThan(0);
  });

  it("posts to openwebui ingest", async () => {
    writeRegistry(`version: "1"
channels:
  openwebui:
    ingest_url: http://127.0.0.1:3000/api/v1/ingest
    events:
      - pipeline_daily_complete
`);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { pushNotifications } = await import("../src/lib/notifications/push.js");
    const { buildTodayContext } = await import("../src/lib/steward-chat/today-context.js");
    const result = await pushNotifications("pipeline_daily_complete", buildTodayContext());

    expect(result.sent.some((s) => s.channel === "openwebui" && s.ok)).toBe(true);
  });

  it("returns empty sent when no channels configured", async () => {
    writeRegistry(`version: "1"
channels: {}
`);
    vi.stubGlobal("fetch", vi.fn());

    const { pushNotifications } = await import("../src/lib/notifications/push.js");
    const { buildTodayContext } = await import("../src/lib/steward-chat/today-context.js");
    const result = await pushNotifications("pipeline_daily_complete", buildTodayContext());

    expect(result.sent.filter((s) => s.channel === "webhook" || s.channel === "openwebui")).toHaveLength(
      0
    );
  });

  it("records webhook failure when fetch returns non-ok", async () => {
    writeRegistry(`version: "1"
channels:
  webhook:
    url: https://hook.example/orgos
    events:
      - pipeline_daily_complete
`);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { pushNotifications } = await import("../src/lib/notifications/push.js");
    const { buildTodayContext } = await import("../src/lib/steward-chat/today-context.js");
    const result = await pushNotifications("pipeline_daily_complete", buildTodayContext());

    expect(result.sent.some((s) => s.channel === "webhook" && !s.ok)).toBe(true);
  });
});
