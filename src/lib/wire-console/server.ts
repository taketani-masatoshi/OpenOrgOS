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
import { WIRE_CONSOLE_SPA_DIST } from "./paths.js";
import { handleConsoleApi } from "./routes/console-api.js";
import { handleEventsStream } from "./routes/events-stream.js";

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

  if (method === "POST" && pathname === "/console/v1/auth/webauthn/options") {
    json(res, 200, { ok: true, ...createWebAuthnLoginOptions() });
    return true;
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

  if (await handleConsoleApi(req, res, pathname, method, searchParams)) {
    return true;
  }

  if (pathname.startsWith("/console/")) {
    json(res, 404, { ok: false, error: "not found" });
    return true;
  }

  return false;
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

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${host}`);
      const pathname = url.pathname;
      const method = req.method ?? "GET";

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

  return new Promise((resolve, reject) => {
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
