/**
 * Vitest 3.x forks workers use birpc with a hardcoded 60s DEFAULT_TIMEOUT.
 * Long sequential suites (fileParallelism: false) can surface:
 *   Error: [vitest-worker]: Timeout calling "onTaskUpdate"
 * even when every test passed. teardownTimeout only covers process kill.
 * Upstream fix is in Vitest 4 — drop this preload when we upgrade.
 *
 * Loaded via poolOptions.forks.execArgv --import (worker only; no disk patch
 * of the shared Core node_modules).
 *
 * CI uses Node 20 (no registerHooks); local Node 22+ can use registerHooks.
 */
import module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function patchSource(url, source) {
  if (!url.includes("/vitest/") || !url.includes("chunks/utils.")) return source;
  if (!source.includes("function createForksRpcOptions")) return source;
  return source
    .replace(
      "function createForksRpcOptions(nodeV8) {\n\treturn {",
      "function createForksRpcOptions(nodeV8) {\n\treturn {\n\t\ttimeout: -1,"
    )
    .replace(
      "function createThreadsRpcOptions({ port }) {\n\treturn {",
      "function createThreadsRpcOptions({ port }) {\n\treturn {\n\t\ttimeout: -1,"
    );
}

if (typeof module.registerHooks === "function") {
  module.registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      const apply = (resolved) => {
        if (resolved.format !== "module" || resolved.source == null) return resolved;
        const raw =
          typeof resolved.source === "string"
            ? resolved.source
            : Buffer.from(resolved.source).toString("utf8");
        const patched = patchSource(url, raw);
        if (patched === raw) return resolved;
        return { ...resolved, source: patched, shortCircuit: true };
      };
      return result && typeof result.then === "function" ? result.then(apply) : apply(result);
    },
  });
} else {
  // Node 20 (GitHub Actions): register() + separate loader hook file
  const here = path.dirname(fileURLToPath(import.meta.url));
  module.register(pathToFileURL(path.join(here, "vitest-birpc-timeout-loader.mjs")).href);
}
