import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import { getPdfEsignCasesPath } from "../src/lib/pdf-esign/paths.js";
import {
  registerSession,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";

const PDF_BASE64 = Buffer.from("%PDF-1.7\nesign bff test\n", "utf-8").toString("base64");

describe("steward chat esign api", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("_fixture-books");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
    process.env.ORGOS_CHAT_AUDIT = "0";
    process.env.ORGOS_SIVA_MODE = "mock";
    // Keep the sidecar probe offline and fast.
    process.env.ORGOS_DIGIDOC_SIDECAR_URL = "http://127.0.0.1:1";
    rmSync(getPdfEsignCasesPath(), { force: true });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    rmSync(getPdfEsignCasesPath(), { force: true });
    process.env = { ...env };
  });

  async function start() {
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  }

  function cookieFor(operatorId: string) {
    const { token } = registerSession({
      operator_id: operatorId,
      approver_id: operatorId,
      mode: "prod",
    });
    return `${WIRE_CONSOLE_SESSION_COOKIE}=${token}`;
  }

  it("reports readiness without leaking the sidecar token", async () => {
    process.env.ORGOS_DIGIDOC_SIDECAR_TOKEN = "token-must-not-appear";
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/esign/ready`, {
      headers: { Cookie: cookieFor("OP-001") },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain("token-must-not-appear");
    expect(JSON.parse(body).report.sidecar_token_configured).toBe(true);
  });

  it("requires chat:approve to create a case", async () => {
    await start();
    const denied = await fetch(`${baseUrl}/chat/v1/esign/create`, {
      method: "POST",
      headers: { Cookie: cookieFor("OP-READONLY"), "Content-Type": "application/json" },
      body: JSON.stringify({ title: "NDA", pdf_base64: PDF_BASE64 }),
    });
    expect(denied.status).toBe(403);

    const listDenied = await fetch(`${baseUrl}/chat/v1/esign/cases`, {
      headers: { Cookie: cookieFor("OP-READONLY") },
    });
    expect(listDenied.status).toBe(200);
  });

  it("creates a case and lists it with digests only", async () => {
    await start();
    const created = await fetch(`${baseUrl}/chat/v1/esign/create`, {
      method: "POST",
      headers: { Cookie: cookieFor("OP-001"), "Content-Type": "application/json" },
      body: JSON.stringify({ title: "NDA", pdf_base64: PDF_BASE64 }),
    });
    expect(created.status).toBe(200);
    const payload = (await created.json()) as { case: { id: string; content_digest: string } };
    expect(payload.case.id).toMatch(/^ES-\d{4}-\d{3}$/);
    expect(payload.case.content_digest).toMatch(/^[0-9a-f]{64}$/);

    const listed = await fetch(`${baseUrl}/chat/v1/esign/cases`, {
      headers: { Cookie: cookieFor("OP-001") },
    });
    const listBody = await listed.text();
    expect(JSON.parse(listBody).cases).toHaveLength(1);
    // The ledger view must not carry document bytes.
    expect(listBody).not.toContain(PDF_BASE64);
  });

  it("rejects verify before a container is attached", async () => {
    await start();
    const created = await fetch(`${baseUrl}/chat/v1/esign/create`, {
      method: "POST",
      headers: { Cookie: cookieFor("OP-001"), "Content-Type": "application/json" },
      body: JSON.stringify({ title: "NDA", pdf_base64: PDF_BASE64 }),
    });
    const { case: row } = (await created.json()) as { case: { id: string } };

    const res = await fetch(`${baseUrl}/chat/v1/esign/verify`, {
      method: "POST",
      headers: { Cookie: cookieFor("OP-001"), "Content-Type": "application/json" },
      body: JSON.stringify({ case_id: row.id }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/attach first/);
  });

  it("rejects an attachment that is not a valid ASiC-E container", async () => {
    await start();
    const created = await fetch(`${baseUrl}/chat/v1/esign/create`, {
      method: "POST",
      headers: { Cookie: cookieFor("OP-001"), "Content-Type": "application/json" },
      body: JSON.stringify({ title: "NDA", pdf_base64: PDF_BASE64 }),
    });
    const { case: row } = (await created.json()) as { case: { id: string } };

    const res = await fetch(`${baseUrl}/chat/v1/esign/attach`, {
      method: "POST",
      headers: { Cookie: cookieFor("OP-001"), "Content-Type": "application/json" },
      body: JSON.stringify({
        case_id: row.id,
        asice_base64: Buffer.from("not a zip", "utf-8").toString("base64"),
      }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("not_zip_local_header");
  });
});
