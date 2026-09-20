/**
 * Locks the public customer-CE HTTP contracts. Image tags stay pinned elsewhere.
 * Path: tests/opendesk-api-contract.test.ts
 */
import { describe, expect, it, vi } from "vitest";
import { sendMatrixMessage } from "../src/lib/integrations/sovereign/matrix-client.js";
import { discoverKeycloak } from "../src/lib/integrations/sovereign/keycloak-oidc.js";
import { pingNextcloud, putNextcloudFile } from "../src/lib/integrations/sovereign/nextcloud-webdav.js";
import { connectorStatusLabel } from "../src/lib/integrations/connector-hub.js";
import { smtpMailPort } from "../src/lib/integrations/compat/smtp-mail-port.js";
import { formatSecretaryL1MirrorLine } from "../src/lib/integrations/secretary-l1-mirror.js";

describe("openDesk public API contracts", () => {
  it("sends Matrix chat on the Client-Server v3 path", async () => {
    let url = "";
    let method = "";
    const result = await sendMatrixMessage(
      { baseUrl: "http://matrix.local", accessToken: "token", roomId: "!room:local" },
      "hello",
      {
        txnId: "txn1",
        fetchImpl: (async (input: string | URL, init?: RequestInit) => {
          url = String(input);
          method = init?.method ?? "GET";
          return new Response("{}", { status: 200 });
        }) as typeof fetch,
      },
    );
    expect(result.ok).toBe(true);
    expect(method).toBe("PUT");
    expect(url).toBe(
      "http://matrix.local/_matrix/client/v3/rooms/!room%3Alocal/send/m.room.message/txn1",
    );
  });

  it("reads Nextcloud status.php and writes WebDAV under the user", async () => {
    const ping = await pingNextcloud(
      { baseUrl: "http://cloud.local", user: "admin", password: "x" },
      (async (input: string | URL) => {
        expect(String(input)).toBe("http://cloud.local/status.php");
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    );
    expect(ping.ok).toBe(true);

    const calls: string[] = [];
    const put = await putNextcloudFile(
      { baseUrl: "http://cloud.local", user: "admin", password: "x" },
      "opendesk-verify/note.txt",
      "hi",
      (async (input: string | URL, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${String(input)}`);
        return new Response("", { status: init?.method === "MKCOL" ? 405 : 201 });
      }) as typeof fetch,
    );
    expect(put.ok).toBe(true);
    expect(calls).toContain(
      "MKCOL http://cloud.local/remote.php/dav/files/admin/opendesk-verify",
    );
    expect(calls).toContain(
      "PUT http://cloud.local/remote.php/dav/files/admin/opendesk-verify/note.txt",
    );
  });

  it("discovers Keycloak OIDC without creating users", async () => {
    let url = "";
    const result = await discoverKeycloak(
      { baseUrl: "http://kc.local", realm: "master" },
      (async (input: string | URL) => {
        url = String(input);
        return new Response(JSON.stringify({ issuer: "http://kc.local/realms/master" }), {
          status: 200,
        });
      }) as typeof fetch,
    );
    expect(result.ok).toBe(true);
    expect(url).toBe("http://kc.local/realms/master/.well-known/openid-configuration");
  });

  it("does not call a flag-off or stub card a successful connection", () => {
    expect(
      connectorStatusLabel({
        inclusion: "stub_unconfirmed",
        platform_ready: false,
        usable: false,
        connected: false,
        expired: false,
        fallback_configured: false,
      }),
    ).toBe("未出荷（スタブ・外へは出しません）");
    expect(
      connectorStatusLabel({
        inclusion: "confirmed_live",
        platform_ready: false,
        usable: true,
        connected: false,
        expired: false,
        fallback_configured: false,
      }),
    ).toBe("未出荷（接続は閉じています）");
    expect(
      connectorStatusLabel({
        inclusion: "confirmed_live",
        platform_ready: true,
        usable: true,
        connected: true,
        expired: false,
        fallback_configured: false,
      }),
    ).toBe("疎通確認済み");
  });

  it("sends generic SMTP through smtpMailPort and refuses receive", async () => {
    const deliver = vi.fn(async () => ({ messageId: "1@smtp" }));
    const port = smtpMailPort(deliver);
    expect(port.provider).toBe("smtp");
    const fetched = await port.fetchSince();
    expect(fetched.ok).toBe(false);
    expect(fetched.reason).toMatch(/IMAP/);
    const sent = await port.sendMime({ mime: "From: a\r\nTo: b\r\n\r\nhi" });
    expect(sent.ok).toBe(true);
    expect(sent.messageId).toBe("1@smtp");
    expect(deliver).toHaveBeenCalledOnce();
  });

  it("logs a Nextcloud L1 failure differently from a missing-config skip", () => {
    expect(formatSecretaryL1MirrorLine({ ok: false, reason: "ORGOS_NEXTCLOUD_* が未設定のためスキップ" })).toMatch(
      /skipped/,
    );
    expect(formatSecretaryL1MirrorLine({ ok: false, reason: "nextcloud_http_500" })).toMatch(/failed/);
  });
});
