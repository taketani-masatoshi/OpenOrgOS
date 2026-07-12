import { execFileSync } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  gmailOAuthTokenSchema,
  type GmailOAuthToken,
} from "../../../schemas/correspondence/gmail-oauth.js";
import {
  gmailOAuthClientSchema,
  type GmailOAuthClient,
} from "../../../schemas/correspondence/gmail-oauth-client.js";
import { getExecutiveRecordsDir } from "./paths.js";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

export function getGmailOAuthTokenPath(): string {
  return join(getExecutiveRecordsDir(), "gmail-oauth.json");
}

export function loadGmailOAuthToken(): GmailOAuthToken | null {
  const path = getGmailOAuthTokenPath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return gmailOAuthTokenSchema.parse(raw);
  } catch {
    return null;
  }
}

export function saveGmailOAuthToken(token: GmailOAuthToken): void {
  const path = getGmailOAuthTokenPath();
  mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(path, JSON.stringify(gmailOAuthTokenSchema.parse(token), null, 2), "utf-8");
}

export function isGmailTokenExpired(token: GmailOAuthToken, skewMs = 60_000): boolean {
  if (!token.expiry_date) return false;
  return Date.now() >= token.expiry_date - skewMs;
}

export async function refreshGmailOAuthToken(
  token: GmailOAuthToken
): Promise<GmailOAuthToken | null> {
  const cfg = getGmailOAuthClientConfig();
  if (!cfg || !token.refresh_token) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };
  if (!body.access_token) return null;

  const refreshed: GmailOAuthToken = {
    ...token,
    access_token: body.access_token,
    token_type: body.token_type ?? token.token_type,
    scope: body.scope ?? token.scope,
    expiry_date: body.expires_in ? Date.now() + body.expires_in * 1000 : token.expiry_date,
  };
  saveGmailOAuthToken(refreshed);
  return refreshed;
}

export async function resolveGmailAccessToken(): Promise<string | null> {
  let token = loadGmailOAuthToken();
  if (!token) return null;
  if (isGmailTokenExpired(token)) {
    token = (await refreshGmailOAuthToken(token)) ?? token;
  }
  return token.access_token;
}

export function getGmailOAuthRedirectUri(): string {
  return (
    process.env.ORGOS_GMAIL_REDIRECT_URI?.trim() || "http://localhost:8787/oauth/gmail/callback"
  );
}

export function getGmailOAuthClientPath(): string {
  return join(getExecutiveRecordsDir(), "gmail-oauth-client.json");
}

export function loadGmailOAuthClientConfig(): GmailOAuthClient | null {
  const path = getGmailOAuthClientPath();
  if (!existsSync(path)) return null;
  try {
    return gmailOAuthClientSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return null;
  }
}

export function saveGmailOAuthClientConfig(client: GmailOAuthClient): void {
  const path = getGmailOAuthClientPath();
  mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(path, JSON.stringify(gmailOAuthClientSchema.parse(client), null, 2), "utf-8");
}

export function ensureGmailOAuthClientForCommunity(expectedClientId?: string): {
  ok: boolean;
  error?: string;
} {
  const existing = getGmailOAuthClientConfig();
  if (existing) {
    if (expectedClientId && existing.clientId !== expectedClientId) {
      return {
        ok: false,
        error: `oauth client id mismatch — Community used ${expectedClientId}, Steward has ${existing.clientId}. Use the same Google OAuth client on both sides.`,
      };
    }
    return { ok: true };
  }

  const envId = process.env.ORGOS_GMAIL_CLIENT_ID?.trim();
  const envSecret = process.env.ORGOS_GMAIL_CLIENT_SECRET?.trim();
  if (!envId || !envSecret) {
    return {
      ok: false,
      error:
        "ORGOS_GMAIL_CLIENT_ID and ORGOS_GMAIL_CLIENT_SECRET required on Steward (must match Community AUTH_GOOGLE_* / ORGOS_GMAIL_*)",
    };
  }
  if (expectedClientId && expectedClientId !== envId) {
    return {
      ok: false,
      error: `oauth client id mismatch — Community used ${expectedClientId}, Steward env has ${envId}`,
    };
  }
  saveGmailOAuthClientConfig({
    version: 1,
    client_id: envId,
    client_secret: envSecret,
  });
  return { ok: true };
}

export function getGmailOAuthClientConfig(): { clientId: string; clientSecret: string } | null {
  const envId = process.env.ORGOS_GMAIL_CLIENT_ID?.trim();
  const envSecret = process.env.ORGOS_GMAIL_CLIENT_SECRET?.trim();
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret };

  const file = loadGmailOAuthClientConfig();
  if (file) return { clientId: file.client_id, clientSecret: file.client_secret };
  return null;
}

export function buildGmailAuthorizeUrl(state?: string): string | undefined {
  const cfg = getGmailOAuthClientConfig();
  if (!cfg) return undefined;
  const redirectUri = getGmailOAuthRedirectUri();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  if (state) params.set("state", state);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGmailOAuthCode(code: string): Promise<GmailOAuthToken> {
  const cfg = getGmailOAuthClientConfig();
  if (!cfg) {
    throw new Error("ORGOS_GMAIL_CLIENT_ID and ORGOS_GMAIL_CLIENT_SECRET are required");
  }
  const redirectUri = getGmailOAuthRedirectUri();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new Error(
      body.error_description ?? body.error ?? `Gmail OAuth token exchange failed (${res.status})`
    );
  }
  const token = gmailOAuthTokenSchema.parse({
    version: 1,
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    token_type: body.token_type ?? "Bearer",
    expiry_date: body.expires_in ? Date.now() + body.expires_in * 1000 : undefined,
    scope: body.scope,
    connected_via: "cli",
  });
  const email = await fetchGmailAccountEmail(token.access_token);
  const saved = email ? { ...token, email } : token;
  saveGmailOAuthToken(saved);
  return saved;
}

export async function fetchGmailAccountEmail(accessToken: string): Promise<string | undefined> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return undefined;
  const body = (await res.json()) as { emailAddress?: string };
  return body.emailAddress;
}

export interface GmailOAuthFlowResult {
  ok: boolean;
  token?: GmailOAuthToken;
  token_path: string;
  email?: string;
  authorize_url?: string;
  error?: string;
}

export async function completeGmailOAuthWithCode(code: string): Promise<GmailOAuthFlowResult> {
  const token_path = getGmailOAuthTokenPath();
  try {
    const token = await exchangeGmailOAuthCode(code);
    return { ok: true, token, token_path, email: token.email };
  } catch (e) {
    return {
      ok: false,
      token_path,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function writeOAuthCallbackPage(res: ServerResponse, ok: boolean, message: string): void {
  res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><html><body style="font-family:sans-serif;padding:2rem"><h1>${
      ok ? "Gmail connected" : "Gmail OAuth failed"
    }</h1><p>${message}</p><p>You can close this tab and return to the terminal.</p></body></html>`
  );
}

function tryOpenBrowser(url: string): void {
  try {
    if (process.platform === "darwin") {
      execFileSync("open", [url], { stdio: "ignore" });
    } else if (process.platform === "win32") {
      execFileSync("cmd", ["/c", "start", "", url], { stdio: "ignore" });
    } else {
      execFileSync("xdg-open", [url], { stdio: "ignore" });
    }
  } catch {
    /* optional */
  }
}

export async function runGmailOAuthCallbackServer(opts?: {
  port?: number;
  timeoutMs?: number;
  openBrowser?: boolean;
}): Promise<GmailOAuthFlowResult> {
  const token_path = getGmailOAuthTokenPath();
  const authorize_url = buildGmailAuthorizeUrl();
  if (!authorize_url) {
    return {
      ok: false,
      token_path,
      error: "Set ORGOS_GMAIL_CLIENT_ID and ORGOS_GMAIL_CLIENT_SECRET",
    };
  }

  const redirectUri = getGmailOAuthRedirectUri();
  const parsed = new URL(redirectUri);
  const port = opts?.port ?? Number(parsed.port || 8787);
  const callbackPath = parsed.pathname || "/oauth/gmail/callback";
  const timeoutMs = opts?.timeoutMs ?? 300_000;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: GmailOAuthFlowResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      resolve(result);
    };

    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const reqUrl = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      if (reqUrl.pathname !== callbackPath) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const err = reqUrl.searchParams.get("error");
      if (err) {
        writeOAuthCallbackPage(res, false, err);
        finish({ ok: false, token_path, authorize_url, error: err });
        return;
      }

      const code = reqUrl.searchParams.get("code");
      if (!code) {
        writeOAuthCallbackPage(res, false, "Missing authorization code");
        finish({ ok: false, token_path, authorize_url, error: "missing code" });
        return;
      }

      const result = await completeGmailOAuthWithCode(code);
      writeOAuthCallbackPage(
        res,
        result.ok,
        result.ok
          ? `Connected${result.email ? ` as ${result.email}` : ""}. Token saved.`
          : (result.error ?? "Token exchange failed")
      );
      finish({ ...result, authorize_url });
    });

    server.on("error", (e) => {
      finish({
        ok: false,
        token_path,
        authorize_url,
        error: e instanceof Error ? e.message : String(e),
      });
    });

    const timer = setTimeout(() => {
      finish({
        ok: false,
        token_path,
        authorize_url,
        error: `Timed out after ${Math.round(timeoutMs / 1000)}s — open authorize URL manually`,
      });
    }, timeoutMs);

    server.listen(port, "127.0.0.1", () => {
      if (opts?.openBrowser !== false) {
        tryOpenBrowser(authorize_url);
      }
    });
  });
}

export function isGmailOAuthConfigured(): boolean {
  const token = loadGmailOAuthToken();
  return Boolean(token?.access_token && (token.refresh_token || !isGmailTokenExpired(token)));
}
