import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STEWARD_CHAT_SPA_DIST } from "../../src/lib/steward-chat/server.js";

/**
 * Server tests need *an* index.html to prove SPA serving. Writing one directly
 * would clobber the real Vite build that E2E runs against, so keep the original
 * bytes and put them back.
 */
export interface SpaDistStub {
  restore: () => void;
}

export function installSpaDistStub(): SpaDistStub {
  const indexPath = join(STEWARD_CHAT_SPA_DIST, "index.html");
  const existed = existsSync(indexPath);
  const original = existed ? readFileSync(indexPath) : undefined;
  mkdirSync(STEWARD_CHAT_SPA_DIST, { recursive: true });
  writeFileSync(indexPath, "<html></html>");
  return {
    restore: () => {
      if (original) writeFileSync(indexPath, original);
      else rmSync(indexPath, { force: true });
    },
  };
}
