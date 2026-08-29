import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearOperatorsRegistryCacheForTests,
  operatorsRegistryPath,
} from "../src/lib/org/operators.js";
import { mintTestOidcIdToken } from "../src/lib/wire-console/auth/oidc.js";
import { authenticateWireConsoleLogin } from "../src/lib/wire-console/auth/login.js";
import { handleCommunityHandoff } from "../src/lib/wire-console/auth/community-handoff.js";
import { resetSessionsForTests, getSessionUser } from "../src/lib/wire-console/auth/session.js";
import type { IncomingMessage, ServerResponse } from "node:http";

function mintWithEmail(claims: {
  sub: string;
  email: string;
  operator_id?: string;
}): string {
  const secret = process.env.WIRE_CONSOLE_OIDC_HS256_SECRET ?? "test-oidc-secret";
  const issuer = process.env.WIRE_CONSOLE_OIDC_ISSUER ?? "https://idp.test/orgos";
  const audience = process.env.WIRE_CONSOLE_OIDC_AUDIENCE ?? "wire-console";
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: issuer,
      aud: audience,
      sub: claims.sub,
      email: claims.email,
      operator_id: claims.operator_id,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString("base64url");
  const signed = `${header}.${payload}`;
  const sig = createHmac("sha256", secret).update(signed).digest("base64url");
  return `${signed}.${sig}`;
}

function captureHandoff(
  idToken: string,
  options?: { uiLocale?: string; host?: string; cookie?: string },
): { status: number; location: string; cookie: string; cookies: string[]; body: string } {
  let status = 0;
  let location = "";
  let cookies: string[] = [];
  let body = "";
  const res = {
    writeHead(code: number, headers?: Record<string, string>) {
      status = code;
      if (headers?.Location) location = headers.Location;
      if (headers?.["Set-Cookie"]) cookies = [headers["Set-Cookie"]];
    },
    setHeader(name: string, value: string | string[]) {
      if (name.toLowerCase() === "set-cookie") {
        cookies = Array.isArray(value) ? value : [value];
      }
    },
    end(chunk?: string) {
      body = chunk ?? "";
    },
  } as unknown as ServerResponse;
  const url = new URL(
    `http://127.0.0.1:9470/auth/community-handoff?token=${encodeURIComponent(idToken)}&next=/wire/`,
  );
  if (options?.uiLocale) url.searchParams.set("ui_locale", options.uiLocale);
  const headers: Record<string, string> = {};
  if (options?.host) headers.host = options.host;
  if (options?.cookie) headers.cookie = options.cookie;
  handleCommunityHandoff({ method: "GET", headers } as IncomingMessage, res, url);
  return { status, location, cookie: cookies.join("; "), cookies, body };
}

describe("Community → Console SSO handoff", () => {
  const prev: Record<string, string | undefined> = {};
  let registrySnapshot = "";

  beforeEach(() => {
    for (const k of [
      "WIRE_CONSOLE_AUTH",
      "WIRE_CONSOLE_OIDC_ISSUER",
      "WIRE_CONSOLE_OIDC_AUDIENCE",
      "WIRE_CONSOLE_OIDC_HS256_SECRET",
      "ORGOS_TENANT",
      "ORGOS_WORKSPACE",
    ]) {
      prev[k] = process.env[k];
    }
    process.env.WIRE_CONSOLE_AUTH = "dev";
    process.env.WIRE_CONSOLE_OIDC_ISSUER = "https://community.oorgos.org";
    process.env.WIRE_CONSOLE_OIDC_AUDIENCE = "orgos-operator-console";
    process.env.WIRE_CONSOLE_OIDC_HS256_SECRET = "community-console-sso-test-secret";
    process.env.ORGOS_TENANT = "mal";
    process.env.ORGOS_WORKSPACE = process.cwd();
    registrySnapshot = readFileSync(operatorsRegistryPath(), "utf-8");
    clearOperatorsRegistryCacheForTests();
    resetSessionsForTests();
  });

  afterEach(() => {
    writeFileSync(operatorsRegistryPath(), registrySnapshot, "utf-8");
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    clearOperatorsRegistryCacheForTests();
    resetSessionsForTests();
  });

  it("accepts id_token in dev mode (passkey not required)", () => {
    const idToken = mintTestOidcIdToken({
      sub: "community-user",
      operator_id: "OP-001",
      approver_id: "段燕燕",
    });
    const result = authenticateWireConsoleLogin({ id_token: idToken });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.user.operator_id).toBe("OP-001");
    expect(result.user.mode).toBe("dev");
  });

  it("maps Google email to operators.yaml via handoff", () => {
    // setup-restore-protocol restores tenants/mal/data/org from HEAD — patch email for this test.
    writeFileSync(
      operatorsRegistryPath(),
      `version: "1"
operators:
  - operator_id: OP-001
    display_name: "段燕燕"
    role: ceo
    status: active
    approver_name: "段燕燕"
    email: k.lab.masa@gmail.com
    key_hash: sha256:8dd1ff0b5462a59485bb66bb7cf392ec711ede10f0f4bca476a70431f8e2f277
  - operator_id: OP-002
    display_name: "秘書オペレータ"
    role: operator
    status: active
    key_hash: sha256:4a7c449d22a99026fac16a47621ff68792ff589f72334ea3950ce186a5615e9a
`,
      "utf-8"
    );
    clearOperatorsRegistryCacheForTests();

    const idToken = mintWithEmail({
      sub: "ooo-user-id",
      email: "k.lab.masa@gmail.com",
    });

    const { status, location, cookie, body } = captureHandoff(idToken);
    expect(status, body).toBe(302);
    expect(location).toBe("/wire/");
    expect(cookie).toContain("orgos_wire_session=");

    const match = /orgos_wire_session=([^;]+)/.exec(cookie);
    expect(match).toBeTruthy();
    const user = getSessionUser(decodeURIComponent(match![1]!));
    expect(user?.operator_id).toBe("OP-001");
  });

  it("shares only the Console UI locale across oorgos.org and clears the legacy cookie", () => {
    const { status, cookies } = captureHandoff(
      mintWithEmail({ sub: "ooo-user-id", email: "k.lab.masa@gmail.com" }),
      { uiLocale: "ja", host: "operator.oorgos.org" },
    );
    expect(status).toBe(302);

    const shared = cookies.filter((line) => line.includes("Domain=.oorgos.org"));
    expect(shared.some((line) => line.startsWith("oorgos-locale=ja"))).toBe(true);
    expect(shared.every((line) => !line.startsWith("oorgos-lang="))).toBe(true);
    expect(cookies.some((line) => line.startsWith("oorgos-lang=ja"))).toBe(true);
    expect(
      cookies.filter((line) => line.startsWith("locale=;") && line.includes("max-age=0")),
    ).toHaveLength(2);
  });

  it("falls back to a leftover Community locale cookie", () => {
    const { status, cookies } = captureHandoff(
      mintWithEmail({ sub: "ooo-user-id", email: "k.lab.masa@gmail.com" }),
      { host: "operator.oorgos.org", cookie: "locale=de" },
    );
    expect(status).toBe(302);
    expect(cookies.some((line) => line.startsWith("oorgos-locale=en"))).toBe(true);
    expect(cookies.some((line) => line.startsWith("locale=;"))).toBe(true);
  });

  it("accepts grandfathered personal email on tenant login_policy", () => {
    const { status, location } = captureHandoff(
      mintWithEmail({ sub: "ooo-user-id", email: "k.lab.masa@gmail.com" }),
    );
    expect(status).toBe(302);
    expect(location).toBe("/wire/");
  });

  it("rejects unmapped email with requireRegistry", () => {
    const idToken = mintWithEmail({
      sub: "ooo-unknown",
      email: "nobody@example.com",
    });
    const { status, body } = captureHandoff(idToken);
    expect(status).toBe(401);
    expect(body).toContain("operators.yaml");
  });

  it("rejects mapped email outside login_policy.email_domains", () => {
    writeFileSync(
      operatorsRegistryPath(),
      `version: "1"
login_policy:
  email_domains:
    - malkk.com
  grandfather_emails: []
operators:
  - operator_id: OP-001
    display_name: "段燕燕"
    role: ceo
    status: active
    approver_name: "段燕燕"
    email: outsider@gmail.com
    key_hash: sha256:8dd1ff0b5462a59485bb66bb7cf392ec711ede10f0f4bca476a70431f8e2f277
`,
      "utf-8",
    );
    clearOperatorsRegistryCacheForTests();

    const { status, body } = captureHandoff(
      mintWithEmail({ sub: "ooo-user-id", email: "outsider@gmail.com" }),
    );
    expect(status).toBe(401);
    expect(body).toContain("login_policy");
  });

  it("accepts company-domain email on the registry", () => {
    writeFileSync(
      operatorsRegistryPath(),
      `version: "1"
login_policy:
  email_domains:
    - malkk.com
operators:
  - operator_id: OP-001
    display_name: "段燕燕"
    role: ceo
    status: active
    approver_name: "段燕燕"
    email: ceo@malkk.com
    key_hash: sha256:8dd1ff0b5462a59485bb66bb7cf392ec711ede10f0f4bca476a70431f8e2f277
`,
      "utf-8",
    );
    clearOperatorsRegistryCacheForTests();

    const { status, location } = captureHandoff(
      mintWithEmail({ sub: "ooo-user-id", email: "ceo@malkk.com" }),
    );
    expect(status).toBe(302);
    expect(location).toBe("/wire/");
  });

  it("rejects token email that does not match the mapped operator email", () => {
    writeFileSync(
      operatorsRegistryPath(),
      `version: "1"
login_policy:
  email_domains:
    - malkk.com
operators:
  - operator_id: OP-001
    display_name: "段燕燕"
    role: ceo
    status: active
    approver_name: "段燕燕"
    email: ceo@malkk.com
    key_hash: sha256:8dd1ff0b5462a59485bb66bb7cf392ec711ede10f0f4bca476a70431f8e2f277
`,
      "utf-8",
    );
    clearOperatorsRegistryCacheForTests();

    const { status, body } = captureHandoff(
      mintWithEmail({
        sub: "ooo-user-id",
        email: "other@malkk.com",
        operator_id: "OP-001",
      }),
    );
    expect(status).toBe(401);
    expect(body).toContain("mapped operator email");
  });
});
