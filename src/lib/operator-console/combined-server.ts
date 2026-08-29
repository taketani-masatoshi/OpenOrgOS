import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { assertProdAuthReady } from "../console-auth/prod-checklist.js";
import { rejectCsrfOriginMismatch } from "../console-auth/csrf.js";
import { rejectRateLimitExceeded } from "../console-auth/rate-limit.js";
import { handleChatApi } from "../steward-chat/routes/chat-api.js";
import { handleSettlementApi } from "../steward-chat/routes/settlement-api.js";
import {
  handleChatAuthApi,
  isPublicChatPath,
  isStewardChatAuthEnabled,
  requireChatAuth,
} from "../steward-chat/auth.js";
import { STEWARD_CHAT_SPA_DIST } from "../steward-chat/server.js";
import { handleWireConsoleApi } from "../wire-console/server.js";
import { handleCommunityHandoff } from "../wire-console/auth/community-handoff.js";
import { preloadOidcJwks } from "../wire-console/auth/oidc.js";
import { sessionTokenFromRequest } from "../wire-console/auth/session.js";
import { runWithTenantIdAsync } from "../tenant.js";
import { resolveTenantFromRequest, isRequestTenantRequired } from "../product/ledger-control-plane.js";

function logDemoSecurityBanner(): void {
  const demoEnv = process.env.ORGOS_ENV === "demo";
  const chatAuthOff = process.env.STEWARD_CHAT_AUTH === "0";
  const wireDev = process.env.WIRE_CONSOLE_AUTH !== "prod";
  if (!demoEnv && !chatAuthOff && !wireDev) return;
  console.warn(
    "[orgos-demo] WARNING: Demo/dev security — authentication disabled or relaxed. " +
      "Bind host to 127.0.0.1 only. Do NOT use in production."
  );
}

export interface OperatorConsoleServerOptions {
  host?: string;
  port?: number;
}

export interface OperatorConsoleServerHandle {
  url: string;
  port: number;
  wireUrl: string;
  chatUrl: string;
  close: (cb?: () => void) => void;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function chatSpaReady(): boolean {
  return existsSync(join(STEWARD_CHAT_SPA_DIST, "index.html"));
}

/**
 * Vite emits content-hashed names under `assets/`, so those are safe to cache
 * forever. Everything else (index.html above all) must revalidate — a cached
 * index.html would keep pointing at the previous bundle after a rebuild.
 */
function cacheControlFor(filePath: string): string {
  return filePath.includes(`${sep}assets${sep}`)
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}

function clientAcceptsGzip(req: IncomingMessage): boolean {
  const ae = req.headers["accept-encoding"];
  return typeof ae === "string" && ae.includes("gzip");
}

function serveFile(res: ServerResponse, filePath: string): void {
  const ext = extname(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": cacheControlFor(filePath),
  });
  createReadStream(filePath).pipe(res);
}

async function serveFileMaybeGzip(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string
): Promise<void> {
  const ext = extname(filePath);
  const compressible =
    filePath.includes(`${sep}assets${sep}`) &&
    (ext === ".js" || ext === ".css") &&
    clientAcceptsGzip(req);

  if (compressible) {
    res.writeHead(200, {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Encoding": "gzip",
      Vary: "Accept-Encoding",
      "Cache-Control": cacheControlFor(filePath),
    });
    await pipeline(createReadStream(filePath), createGzip(), res);
    return;
  }

  serveFile(res, filePath);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * Combined Operator Console — Steward Chat SPA (incl. `/wire/` client route) + shared APIs.
 */
export async function startOperatorConsoleServer(
  opts: OperatorConsoleServerOptions = {}
): Promise<OperatorConsoleServerHandle> {
  assertProdAuthReady("all");
  logDemoSecurityBanner();
  await preloadOidcJwks();

  const host = opts.host ?? process.env.OPERATOR_CONSOLE_HOST?.trim() ?? "127.0.0.1";
  const port = opts.port ?? Number(process.env.OPERATOR_CONSOLE_PORT ?? 9470);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${host}`);
      const pathname = url.pathname;
      const method = req.method ?? "GET";

      if (rejectCsrfOriginMismatch(req, res, req.headers.host ?? `${host}:${port}`)) {
        return;
      }

      if (rejectRateLimitExceeded(req, res)) {
        return;
      }

      if (pathname === "/health") {
        const spa = chatSpaReady();
        json(res, 200, {
          ok: true,
          service: "operator-console",
          auth: isStewardChatAuthEnabled(),
          wire_spa: spa,
          chat_spa: spa,
        });
        return;
      }

      if (pathname === "/auth/community-handoff") {
        handleCommunityHandoff(req, res, url);
        return;
      }

      if (await handleChatAuthApi(req, res, pathname, method, readBody)) {
        return;
      }

      if (isPublicChatPath(pathname, method) && pathname.startsWith("/chat/v1/settlement/")) {
        const handled = await handleSettlementApi(req, res, pathname, method, {
          user: null,
          readBody,
          hostFallback: req.headers.host ?? `${host}:${port}`,
        });
        if (handled) return;
      }

      if (await handleWireConsoleApi(req, res, pathname, method, url.searchParams)) {
        return;
      }

      if (pathname.startsWith("/chat/v1/") && !isPublicChatPath(pathname, method)) {
        const user = requireChatAuth(req, res);
        if (!user) return;
        const requestTenant = resolveTenantFromRequest(req);
        if (isRequestTenantRequired() && !requestTenant) {
          json(res, 400, {
            ok: false,
            error: "X-OrgOS-Tenant or tenant host required (ORGOS_REQUIRE_REQUEST_TENANT=1)",
          });
          return;
        }
        const runChat = () =>
          handleChatApi(req, res, pathname, method, {
            user,
            sessionToken: sessionTokenFromRequest(req),
          });
        const handled = requestTenant
          ? await runWithTenantIdAsync(requestTenant, runChat)
          : await runChat();
        if (handled) return;
        json(res, 404, { error: "not found" });
        return;
      }

      if (pathname.startsWith("/console/v1/")) {
        json(res, 404, { ok: false, error: "not found" });
        return;
      }

      if (existsSync(STEWARD_CHAT_SPA_DIST)) {
        const rel = pathname === "/" ? "/index.html" : pathname;
        const filePath = join(STEWARD_CHAT_SPA_DIST, rel);
        if (existsSync(filePath) && statSync(filePath).isFile()) {
          await serveFileMaybeGzip(req, res, filePath);
          return;
        }
        const indexHtml = join(STEWARD_CHAT_SPA_DIST, "index.html");
        if (existsSync(indexHtml)) {
          serveFile(res, indexHtml);
          return;
        }
      }

      json(res, 404, { error: "not found" });
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.on("error", reject);
  });

  const addr = server.address();
  const actualPort =
    typeof addr === "object" && addr && "port" in addr ? addr.port : port;
  const base = `http://${host}:${actualPort}`;
  return {
    url: base,
    port: actualPort,
    wireUrl: `${base}/wire`,
    chatUrl: `${base}/`,
    close: (cb) => server.close(cb),
  };
}
