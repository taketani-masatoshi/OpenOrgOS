import type { IncomingMessage, ServerResponse } from "node:http";
import { getSessionUser, sessionTokenFromRequest } from "../auth/session.js";
import { computeWireConsoleFingerprints, globalWireConsoleFingerprint } from "../snapshot-watch.js";

const SSE_POLL_MS = Number(process.env.WIRE_CONSOLE_SSE_POLL_MS ?? 2000);

function writeSse(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function handleEventsStream(req: IncomingMessage, res: ServerResponse): boolean {
  const user = getSessionUser(sessionTokenFromRequest(req));
  if (!user) {
    res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
    return true;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  let lastGlobal = "";
  let closed = false;

  const push = () => {
    if (closed) return;
    try {
      const tenants = computeWireConsoleFingerprints();
      const global = globalWireConsoleFingerprint(tenants);
      if (global !== lastGlobal) {
        lastGlobal = global;
        writeSse(res, "snapshot", { ok: true, global, tenants, at: new Date().toISOString() });
      } else {
        writeSse(res, "heartbeat", { ok: true, at: new Date().toISOString() });
      }
    } catch (e) {
      writeSse(res, "error", {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  push();
  const timer = setInterval(push, SSE_POLL_MS);

  req.on("close", () => {
    closed = true;
    clearInterval(timer);
  });

  return true;
}
