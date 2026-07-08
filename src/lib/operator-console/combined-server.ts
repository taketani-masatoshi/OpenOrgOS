import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, createReadStream, statSync } from "node:fs";
import { extname, join } from "node:path";
import { assertProdAuthReady } from "../console-auth/prod-checklist.js";
import { rejectCsrfOriginMismatch } from "../console-auth/csrf.js";
import { rejectRateLimitExceeded } from "../console-auth/rate-limit.js";
import { handleChatApi } from "../steward-chat/routes/chat-api.js";
import {
  handleChatAuthApi,
  isPublicChatPath,
  isStewardChatAuthEnabled,
  requireChatAuth,
} from "../steward-chat/auth.js";
import { STEWARD_CHAT_SPA_DIST } from "../steward-chat/server.js";
import { handleWireConsoleApi } from "../wire-console/server.js";
import { WIRE_CONSOLE_SPA_DIST } from "../wire-console/paths.js";
import { preloadOidcJwks } from "../wire-console/auth/oidc.js";
import { sessionTokenFromRequest } from "../wire-console/auth/session.js";

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

function wireConsoleCombinedDist(): string {
  const combined = join(process.cwd(), "apps", "wire-console", "dist-combined");
  if (existsSync(join(combined, "index.html"))) return combined;
  return WIRE_CONSOLE_SPA_DIST;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function serveFile(res: ServerResponse, filePath: string): void {
  const ext = extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function serveSpaAtPrefix(res: ServerResponse, distDir: string, pathname: string, prefix: string): boolean {
  const indexHtml = join(distDir, "index.html");
  if (!existsSync(indexHtml)) return false;

  if (pathname.startsWith(`${prefix}/assets/`)) {
    const rel = pathname.slice(prefix.length + 1);
    const assetPath = join(distDir, rel);
    if (existsSync(assetPath) && statSync(assetPath).isFile()) {
      serveFile(res, assetPath);
      return true;
    }
  }

  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
    serveFile(res, indexHtml);
    return true;
  }

  return false;
}

/**
 * Combined Operator Console — Steward Chat + Wire Console on one origin (shared session cookie).
 */
export async function startOperatorConsoleServer(
  opts: OperatorConsoleServerOptions = {}
): Promise<OperatorConsoleServerHandle> {
  assertProdAuthReady("all");
  logDemoSecurityBanner();
  await preloadOidcJwks();

  const host = opts.host ?? process.env.OPERATOR_CONSOLE_HOST?.trim() ?? "127.0.0.1";
  const port = opts.port ?? Number(process.env.OPERATOR_CONSOLE_PORT ?? 9470);
  const wireDist = wireConsoleCombinedDist();

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
        json(res, 200, {
          ok: true,
          service: "operator-console",
          auth: isStewardChatAuthEnabled(),
          wire_spa: existsSync(join(wireDist, "index.html")),
          chat_spa: existsSync(join(STEWARD_CHAT_SPA_DIST, "index.html")),
        });
        return;
      }

      if (await handleChatAuthApi(req, res, pathname, method, readBody)) {
        return;
      }

      if (await handleWireConsoleApi(req, res, pathname, method, url.searchParams)) {
        return;
      }

      if (pathname.startsWith("/chat/v1/") && !isPublicChatPath(pathname, method)) {
        const user = requireChatAuth(req, res);
        if (!user) return;
        const handled = await handleChatApi(req, res, pathname, method, {
          user,
          sessionToken: sessionTokenFromRequest(req),
        });
        if (handled) return;
        json(res, 404, { error: "not found" });
        return;
      }

      if (pathname.startsWith("/console/v1/")) {
        json(res, 404, { ok: false, error: "not found" });
        return;
      }

      if (serveSpaAtPrefix(res, wireDist, pathname, "/wire")) {
        return;
      }

      if (existsSync(STEWARD_CHAT_SPA_DIST)) {
        const rel = pathname === "/" ? "/index.html" : pathname;
        const filePath = join(STEWARD_CHAT_SPA_DIST, rel);
        if (existsSync(filePath) && statSync(filePath).isFile()) {
          serveFile(res, filePath);
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
