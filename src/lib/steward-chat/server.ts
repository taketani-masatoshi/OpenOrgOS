import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, createReadStream, statSync } from "node:fs";
import { extname, join } from "node:path";
import { assertProdAuthReady } from "../console-auth/prod-checklist.js";
import { rejectCsrfOriginMismatch } from "../console-auth/csrf.js";
import { rejectRateLimitExceeded } from "../console-auth/rate-limit.js";
import { handleChatApi } from "./routes/chat-api.js";
import {
  handleChatAuthApi,
  isPublicChatPath,
  isStewardChatAuthEnabled,
  requireChatAuth,
} from "./auth.js";
import { sessionTokenFromRequest } from "../wire-console/auth/session.js";

export const STEWARD_CHAT_SPA_DIST = join(process.cwd(), "apps", "steward-chat", "dist");

export interface StewardChatServerOptions {
  host?: string;
  port?: number;
}

export interface StewardChatServerHandle {
  url: string;
  port: number;
  close: (cb?: () => void) => void;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function serveStatic(res: ServerResponse, filePath: string): void {
  const ext = extname(filePath);
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
  };
  res.writeHead(200, { "Content-Type": types[ext] ?? "application/octet-stream" });
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

export function startStewardChatServer(opts: StewardChatServerOptions = {}): StewardChatServerHandle {
  assertProdAuthReady("chat");
  const host = opts.host ?? process.env.STEWARD_CHAT_HOST?.trim() ?? "127.0.0.1";
  const port = opts.port ?? Number(process.env.STEWARD_CHAT_PORT ?? 9471);

  const server = createServer(async (req, res) => {
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
        service: "steward-chat",
        auth: isStewardChatAuthEnabled(),
      });
      return;
    }

    if (await handleChatAuthApi(req, res, pathname, method, readBody)) {
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

    if (existsSync(STEWARD_CHAT_SPA_DIST)) {
      const rel = pathname === "/" ? "/index.html" : pathname;
      const filePath = join(STEWARD_CHAT_SPA_DIST, rel);
      if (existsSync(filePath) && statSync(filePath).isFile()) {
        serveStatic(res, filePath);
        return;
      }
      const indexHtml = join(STEWARD_CHAT_SPA_DIST, "index.html");
      if (existsSync(indexHtml)) {
        serveStatic(res, indexHtml);
        return;
      }
    }

    json(res, 404, { error: "not found" });
  });

  server.listen(port, host);
  return {
    url: `http://${host}:${port}`,
    port,
    close: (cb) => server.close(cb),
  };
}
