import { afterEach, describe, expect, it } from "vitest";
import { startWireConsoleServer } from "../src/lib/wire-console/server.js";
import {
  resetSessionsForTests,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";
import { listWireConsoleTenants } from "../src/lib/wire-console/tenant-registry.js";

describe("wire console server", () => {
  let close: (() => void) | undefined;
  let baseUrl = "";
  const envSnapshot = {
    auth: process.env.WIRE_CONSOLE_AUTH,
    prodToken: process.env.WIRE_CONSOLE_PROD_TOKEN,
  };

  afterEach(() => {
    close?.();
    close = undefined;
    resetSessionsForTests();
    if (envSnapshot.auth === undefined) delete process.env.WIRE_CONSOLE_AUTH;
    else process.env.WIRE_CONSOLE_AUTH = envSnapshot.auth;
    if (envSnapshot.prodToken === undefined) delete process.env.WIRE_CONSOLE_PROD_TOKEN;
    else process.env.WIRE_CONSOLE_PROD_TOKEN = envSnapshot.prodToken;
  });

  it("health returns ok", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    baseUrl = server.url;
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("wire-console");
  });

  it("lists wire_console tenants including demo orgs", () => {
    const ids = listWireConsoleTenants().map((t) => t.id);
    expect(ids).toContain("southwood");
    expect(ids).toContain("aiac");
  });

  it("login sets session and returns tenants", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    baseUrl = server.url;

    const login = await fetch(`${baseUrl}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "orgos-dev" }),
    });
    expect(login.status).toBe(200);
    const setCookie = login.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(WIRE_CONSOLE_SESSION_COOKIE);

    const tenants = await fetch(`${baseUrl}/console/v1/tenants`, {
      headers: { cookie: setCookie.split(";")[0]! },
    });
    expect(tenants.status).toBe(200);
    const body = (await tenants.json()) as { ok: boolean; tenants: { id: string }[] };
    expect(body.ok).toBe(true);
    expect(body.tenants.some((t) => t.id === "southwood")).toBe(true);
  });

  it("rejects tenants without session", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const res = await fetch(`${server.url}/console/v1/tenants`);
    expect(res.status).toBe(401);
  });

  it("returns southwood snapshot and outbox when authenticated", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    baseUrl = server.url;

    const login = await fetch(`${baseUrl}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "orgos-dev" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

    const snapshot = await fetch(`${baseUrl}/console/v1/tenants/southwood/snapshot`, {
      headers: { cookie },
    });
    expect(snapshot.status).toBe(200);
    const snapBody = (await snapshot.json()) as {
      ok: boolean;
      tenant_id: string;
      validation: { ok: boolean };
      counts: { outbox: number; inbox: number };
    };
    expect(snapBody.tenant_id).toBe("southwood");
    expect(snapBody.validation.ok).toBe(true);
    expect(snapBody.counts.outbox).toBeGreaterThan(0);

    const outbox = await fetch(`${baseUrl}/console/v1/tenants/southwood/outbox`, {
      headers: { cookie },
    });
    const outBody = (await outbox.json()) as { entries: { event_id: string }[] };
    expect(outBody.entries.length).toBeGreaterThan(0);
  });

  it("loads event detail for inter-org demo event", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    baseUrl = server.url;

    const login = await fetch(`${baseUrl}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "orgos-dev" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

    const res = await fetch(
      `${baseUrl}/console/v1/tenants/southwood/events/a1b2c3d4-e5f6-4789-a012-3456789abcde`,
      { headers: { cookie } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { location: string; event_id: string };
    expect(body.location).toBe("inbox");
    expect(body.event_id).toBe("a1b2c3d4-e5f6-4789-a012-3456789abcde");
  });

  it("returns event workflow steps", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    baseUrl = server.url;

    const login = await fetch(`${baseUrl}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "orgos-dev", approver_id: "南木健一" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

    const res = await fetch(
      `${baseUrl}/console/v1/tenants/southwood/events/a1b2c3d4-e5f6-4789-a012-3456789abcde/workflow`,
      { headers: { cookie } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; steps: { id: string }[] };
    expect(body.steps.map((s) => s.id)).toEqual(["approval", "outbox", "delivery", "witness"]);
  });

  it("propose and approve wire notice via console API", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    baseUrl = server.url;

    const login = await fetch(`${baseUrl}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passkey: "orgos-dev",
        approver_id: "南木健一",
        operator_id: "wire-console-test",
      }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

    const propose = await fetch(`${baseUrl}/console/v1/tenants/southwood/notices/propose`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        peer_id: "PEER-002",
        transaction_type: "contract.execution.notice",
        contract_id: "CTR-012",
        message: "Wire Console Wave 2 test notice",
      }),
    });
    expect(propose.status).toBe(200);
    const proposed = (await propose.json()) as {
      ok: boolean;
      notice: { notice_id: string; status: string };
    };
    expect(proposed.notice.status).toBe("pending_approval");

    const approve = await fetch(
      `${baseUrl}/console/v1/tenants/southwood/notices/${proposed.notice.notice_id}/approve`,
      {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: "{}",
      }
    );
    expect(approve.status).toBe(200);
    const approved = (await approve.json()) as {
      ok: boolean;
      transmission: { event_id: string; transaction_id: string };
      notice: { status: string };
    };
    expect(approved.notice.status).toBe("transmitted");
    expect(approved.transmission.event_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("rejects write API without session", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const res = await fetch(`${server.url}/console/v1/tenants/southwood/delivery/flush-pending`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(401);
  });

  it("returns auth config", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const res = await fetch(`${server.url}/console/v1/auth/config`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      mode: string;
      dev_login_allowed: boolean;
    };
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("dev");
    expect(body.dev_login_allowed).toBe(true);
  });

  it("blocks dev passkey when WIRE_CONSOLE_AUTH=prod", async () => {
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.WIRE_CONSOLE_PROD_TOKEN = "prod-secret-token";

    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;

    const res = await fetch(`${server.url}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "orgos-dev" }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("disabled");
  });

  it("accepts prod token login when WIRE_CONSOLE_AUTH=prod", async () => {
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.WIRE_CONSOLE_PROD_TOKEN = "prod-secret-token";

    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;

    const login = await fetch(`${server.url}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prod_token: "prod-secret-token",
        operator_id: "ops",
        approver_id: "南木健一",
      }),
    });
    expect(login.status).toBe(200);
    const body = (await login.json()) as { user: { mode: string } };
    expect(body.user.mode).toBe("prod");
  });

  it("streams SSE snapshot events when authenticated", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    baseUrl = server.url;

    const login = await fetch(`${baseUrl}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "orgos-dev" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

    const res = await fetch(`${baseUrl}/console/v1/events/stream`, {
      headers: { cookie, Accept: "text/event-stream" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value);
    expect(chunk).toContain("event: snapshot");
    await reader.cancel();
  });
});
