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
});
