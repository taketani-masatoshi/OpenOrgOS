import { describe, expect, it } from "vitest";
import { pingOx } from "../src/lib/integrations/sovereign/ox-client.js";
import { m365MailPort } from "../src/lib/integrations/compat-ports.js";

describe("opendesk OX inclusion", () => {
  it("does not call the network while OX is unconfirmed", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("no", { status: 500 });
    }) as typeof fetch;
    const result = await pingOx({
      inclusion: "stub_unconfirmed",
      config: { baseUrl: "http://ox.local", user: "a", password: "b" },
      fetchImpl,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("外へは出しません");
    expect(called).toBe(false);
  });

  it("pings OX only after inclusion is confirmed_live", async () => {
    const fetchImpl = (async (url: string | URL) => {
      expect(String(url)).toBe("http://ox.local/appsuite/api/health");
      return new Response("ok", { status: 200 });
    }) as typeof fetch;
    const result = await pingOx({
      inclusion: "confirmed_live",
      config: { baseUrl: "http://ox.local", user: "a", password: "b" },
      fetchImpl,
    });
    expect(result.ok).toBe(true);
  });

  it("keeps Microsoft 365 as a stub that does not leave", async () => {
    const result = await m365MailPort().ping();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("外へは出しません");
  });
});
