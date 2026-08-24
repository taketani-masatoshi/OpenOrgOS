import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import {
  clearSessionCookie,
  destroySession,
  getSessionUser,
  sessionTokenFromRequest,
  setSessionCookie,
} from "./auth/session.js";
import { authenticateWireConsoleLogin, createWebAuthnLoginOptions, getWireConsoleAuthConfigResponse } from "./auth/login.js";
import { completeWebAuthnE2eLogin, isWebAuthnE2eLoginEnabled } from "./auth/webauthn-e2e.js";
import {
  authorizeWebAuthnRegistration,
  createWebAuthnRegisterOptions,
  isWebAuthnRegistrationAllowed,
  registrationErrorStatus,
  resolveRegistrationHttpStatus,
  verifyWebAuthnRegistration,
} from "./auth/webauthn-register.js";
import {
  listPasskeysForSession,
  revokePasskeyForSession,
} from "./auth/webauthn-credentials-api.js";
import { WIRE_CONSOLE_SPA_DIST } from "./paths.js";
import { handleConsoleApi } from "./routes/console-api.js";
import { handleEventsStream } from "./routes/events-stream.js";
import { preloadOidcJwks } from "./auth/oidc.js";
import { assertProdAuthReady } from "../console-auth/prod-checklist.js";
import { rejectCsrfOriginMismatch } from "../console-auth/csrf.js";
import { rejectRateLimitExceeded } from "../console-auth/rate-limit.js";
import { handleSettlementApi } from "../steward-chat/routes/settlement-api.js";

function isSettlementPublicPath(pathname: string, method: string): boolean {
  if (pathname.startsWith("/chat/v1/settlement/challenge/") && method === "GET") return true;
  if (pathname === "/chat/v1/settlement/complete" && method === "POST") return true;
  if (method === "OPTIONS" && pathname.startsWith("/chat/v1/settlement/")) return true;
  return false;
}

export interface WireConsoleServerOptions {
  host?: string;
  port?: number;
}

export interface WireConsoleServerHandle {
  url: string;
  port: number;
  close: () => void;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/health" ||
    pathname === "/console/v1/auth/login" ||
    pathname === "/console/v1/auth/config" ||
    pathname === "/console/v1/auth/webauthn/options" ||
    pathname === "/console/v1/auth/webauthn/register/options" ||
    pathname === "/console/v1/auth/webauthn/register" ||
    (isWebAuthnE2eLoginEnabled() && pathname === "/console/v1/auth/webauthn/e2e-complete") ||
    pathname.startsWith("/assets/") ||
    (!pathname.startsWith("/console/") && pathname !== "/favicon.ico")
  );
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  searchParams: URLSearchParams
): Promise<boolean> {
  if (method === "GET" && pathname === "/health") {
    json(res, 200, { ok: true, service: "wire-console" });
    return true;
  }

  if (method === "GET" && pathname === "/console/v1/auth/config") {
    json(res, 200, { ok: true, ...getWireConsoleAuthConfigResponse() });
    return true;
  }

  if (method === "POST" && pathname === "/console/v1/auth/webauthn/register/options") {
    try {
      const sessionUser = getSessionUser(sessionTokenFromRequest(req));
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as {
        operator_id?: string;
        approver_id?: string;
        purpose?: "login" | "settlement";
        bootstrap_token?: string;
      };
      const purpose = body.purpose === "settlement" ? "settlement" : "login";
      const result = createWebAuthnRegisterOptions(
        {
          operator_id: body.operator_id ?? "",
          approver_id: body.approver_id ?? "",
          purpose,
          bootstrap_token: body.bootstrap_token,
        },
        { sessionUser }
      );
      if ("error" in result) {
        json(res, resolveRegistrationHttpStatus(result), { ok: false, error: result.error });
        return true;
      }
      json(res, 200, { ok: true, ...result });
      return true;
    } catch (e) {
      json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
      return true;
    }
  }

  if (method === "POST" && pathname === "/console/v1/auth/webauthn/register") {
    try {
      const sessionUser = getSessionUser(sessionTokenFromRequest(req));
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as Parameters<typeof verifyWebAuthnRegistration>[0];
      const purpose = body.purpose === "settlement" ? "settlement" : "login";
      const authorized = authorizeWebAuthnRegistration(
        {
          operator_id: body.operator_id ?? "",
          approver_id: body.approver_id ?? "",
          purpose,
          bootstrap_token: (body as { bootstrap_token?: string }).bootstrap_token,
        },
        sessionUser
      );
      if ("status" in authorized) {
        json(res, authorized.status, { ok: false, error: authorized.error });
        return true;
      }
      const result = verifyWebAuthnRegistration({ ...body, purpose });
      if ("error" in result) {
        json(res, 401, { ok: false, error: result.error });
        return true;
      }
      if (result.token && result.user) {
        setSessionCookie(res, result.token);
        json(res, 200, {
          ok: true,
          user: result.user,
          credential_id: result.credential_id,
          purpose: "login",
        });
      } else {
        json(res, 200, {
          ok: true,
          credential_id: result.credential_id,
          purpose: "settlement",
        });
      }
      return true;
    } catch (e) {
      json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
      return true;
    }
  }

  if (method === "POST" && pathname === "/console/v1/auth/webauthn/options") {
    json(res, 200, { ok: true, ...createWebAuthnLoginOptions() });
    return true;
  }

  if (method === "POST" && pathname === "/console/v1/auth/webauthn/e2e-complete") {
    if (!isWebAuthnE2eLoginEnabled()) {
      json(res, 404, { ok: false, error: "not found" });
      return true;
    }
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as { challenge?: string };
      if (!body.challenge) {
        json(res, 422, { ok: false, error: "challenge required" });
        return true;
      }
      const result = completeWebAuthnE2eLogin(body.challenge);
      if ("error" in result) {
        json(res, 401, { ok: false, error: result.error });
        return true;
      }
      setSessionCookie(res, result.token);
      json(res, 200, { ok: true, user: result.user });
      return true;
    } catch (e) {
      json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
      return true;
    }
  }

  if (method === "POST" && pathname === "/console/v1/auth/login") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as Parameters<typeof authenticateWireConsoleLogin>[0];
      const result = authenticateWireConsoleLogin(body);
      if ("error" in result) {
        json(res, result.status, { ok: false, error: result.error });
        return true;
      }
      if (result.deprecated) {
        res.setHeader("Deprecation", "true");
        res.setHeader("Warning", '299 - "prod_token login deprecated"');
      }
      setSessionCookie(res, result.token);
      json(res, 200, { ok: true, user: result.user, deprecated: result.deprecated });
      return true;
    } catch (e) {
      json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
      return true;
    }
  }

  if (method === "GET" && pathname === "/console/v1/events/stream") {
    return handleEventsStream(req, res);
  }

  if (pathname.startsWith("/chat/v1/settlement/")) {
    if (
      method === "POST" &&
      pathname === "/chat/v1/settlement/challenge" &&
      rejectCsrfOriginMismatch(req, res)
    ) {
      return true;
    }
    if (
      method === "POST" &&
      pathname === "/chat/v1/settlement/challenge" &&
      rejectRateLimitExceeded(req, res)
    ) {
      return true;
    }
    const sessionUser = getSessionUser(sessionTokenFromRequest(req));
    if (!isSettlementPublicPath(pathname, method) && !sessionUser) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return true;
    }
    if (
      await handleSettlementApi(req, res, pathname, method, {
        user: sessionUser ?? null,
        readBody,
        hostFallback: req.headers.host,
      })
    ) {
      return true;
    }
    json(res, 404, { ok: false, error: "not found" });
    return true;
  }

  if (
    pathname === "/console/v1/auth/logout" ||
    pathname === "/console/v1/auth/me" ||
    pathname.startsWith("/console/v1/tenants")
  ) {
    const user = getSessionUser(sessionTokenFromRequest(req));
    if (!user) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return true;
    }
  }

  if (method === "POST" && pathname === "/console/v1/auth/logout") {
    destroySession(sessionTokenFromRequest(req));
    clearSessionCookie(res);
    json(res, 200, { ok: true });
    return true;
  }

  if (method === "GET" && pathname === "/console/v1/auth/me") {
    const user = getSessionUser(sessionTokenFromRequest(req))!;
    json(res, 200, { ok: true, user });
    return true;
  }

  if (method === "GET" && pathname === "/console/v1/auth/webauthn/credentials") {
    const user = getSessionUser(sessionTokenFromRequest(req));
    if (!user) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return true;
    }
    json(res, 200, { ok: true, ...listPasskeysForSession(user) });
    return true;
  }

  const consoleCredentialDeleteMatch = pathname.match(
    /^\/console\/v1\/auth\/webauthn\/credentials\/([^/]+)$/
  );
  if (method === "DELETE" && consoleCredentialDeleteMatch) {
    const user = getSessionUser(sessionTokenFromRequest(req));
    if (!user) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return true;
    }
    const revoked = revokePasskeyForSession(
      user,
      decodeURIComponent(consoleCredentialDeleteMatch[1]!)
    );
    if ("error" in revoked) {
      json(res, revoked.status, { ok: false, error: revoked.error });
      return true;
    }
    json(res, 200, { ok: true });
    return true;
  }

  if (await handleConsoleApi(req, res, pathname, method, searchParams)) {
    return true;
  }

  if (pathname.startsWith("/console/")) {
    json(res, 404, { ok: false, error: "not found" });
    return true;
  }

  return false;
}

/** Combined Operator Console — reuse Wire BFF routes on shared origin. */
export async function handleWireConsoleApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  searchParams: URLSearchParams
): Promise<boolean> {
  return handleApi(req, res, pathname, method, searchParams);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

function serveStatic(res: ServerResponse, filePath: string): void {
  const ext = extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

function serveSpa(req: IncomingMessage, res: ServerResponse, pathname: string): void {
  const distIndex = join(WIRE_CONSOLE_SPA_DIST, "index.html");
  if (pathname !== "/" && pathname !== "/index.html") {
    const assetPath = join(WIRE_CONSOLE_SPA_DIST, pathname.replace(/^\//, ""));
    if (existsSync(assetPath) && statSync(assetPath).isFile()) {
      serveStatic(res, assetPath);
      return;
    }
  }
  if (existsSync(distIndex)) {
    serveStatic(res, distIndex);
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(fallbackHtml());
}

function fallbackHtml(): string {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"/><title>Wire Console</title></head>
<body><h1>Wire Console</h1><p>SPA not built. Run <code>npm run wire-console:build</code>.</p>
<p><a href="/health">/health</a> · POST /console/v1/auth/login</p></body></html>`;
}

export function startWireConsoleServer(
  options: WireConsoleServerOptions = {}
): Promise<WireConsoleServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;

  return preloadOidcJwks().then(
    () => {
      assertProdAuthReady("wire");
      return new Promise<WireConsoleServerHandle>((resolve, reject) => {
        const server = createServer(async (req, res) => {
          try {
            const url = new URL(req.url ?? "/", `http://${host}`);
            const pathname = url.pathname;
            const method = req.method ?? "GET";

            if (
              method === "POST" &&
              pathname.startsWith("/console/v1/") &&
              !pathname.startsWith("/console/v1/auth/")
            ) {
              if (rejectCsrfOriginMismatch(req, res)) return;
              if (rejectRateLimitExceeded(req, res)) return;
            }

            if (await handleApi(req, res, pathname, method, url.searchParams)) return;

            if (!isPublicPath(pathname)) {
              const user = getSessionUser(sessionTokenFromRequest(req));
              if (!user) {
                json(res, 401, { ok: false, error: "unauthorized" });
                return;
              }
            }

            if (pathname.startsWith("/console/")) {
              json(res, 404, { ok: false, error: "not found" });
              return;
            }

            serveSpa(req, res, pathname);
          } catch (e) {
            json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        });

        server.listen(port, host, () => {
          const addr = server.address();
          const actualPort = typeof addr === "object" && addr && "port" in addr ? addr.port : port;
          const url = `http://${host}:${actualPort}`;
          resolve({
            url,
            port: actualPort,
            close: () => server.close(),
          });
        });
        server.on("error", reject);
      });
    }
  );
}
