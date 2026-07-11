import { describe, it, expect, afterEach } from "vitest";
import { startProtocolApiServer } from "../src/lib/protocol/protocol-api-server.js";

describe("protocol API server", () => {
  let close: (() => void) | undefined;

  afterEach(() => {
    close?.();
    close = undefined;
  });

  it("serves health and trust bundle 404 when unpublished", async () => {
    const server = await startProtocolApiServer({ host: "127.0.0.1", port: 0 });
    close = server.close;
    const health = await fetch(`${server.url}/health`);
    expect(health.ok).toBe(true);

    const trust = await fetch(`${server.url}/protocol/v1/trust/bundle`);
    expect(trust.status).toBe(404);
  });

  it("serves community wire-node API catalog and pending", async () => {
    const server = await startProtocolApiServer({ host: "127.0.0.1", port: 0 });
    close = server.close;

    const catalog = await fetch(`${server.url}/protocol/v1/community/wire-node`);
    expect(catalog.ok).toBe(true);
    const catBody = (await catalog.json()) as { routes?: unknown[] };
    expect(catBody.routes?.length).toBeGreaterThan(0);

    const pending = await fetch(`${server.url}/protocol/v1/community/wire-node/pending`);
    expect(pending.ok).toBe(true);
    const pendingBody = (await pending.json()) as { ok: boolean; pending: unknown[] };
    expect(pendingBody.ok).toBe(true);
    expect(Array.isArray(pendingBody.pending)).toBe(true);
  });

  it("serves community tenant-mail API catalog", async () => {
    const server = await startProtocolApiServer({ host: "127.0.0.1", port: 0 });
    close = server.close;

    const res = await fetch(`${server.url}/protocol/v1/community/tenant-mail`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { base_path?: string; routes?: unknown[] };
    expect(body.base_path).toBe("/protocol/v1/community/tenant-mail");
    expect(body.routes?.length).toBeGreaterThan(0);
  });
});
