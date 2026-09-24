/**
 * Vitest 3.x forks workers use birpc with a hardcoded 60s DEFAULT_TIMEOUT.
 * Long sequential suites (fileParallelism: false) can surface:
 *   Error: [vitest-worker]: Timeout calling "onTaskUpdate"
 * even when every test passed. teardownTimeout only covers process kill.
 * Upstream fix is in Vitest 4 — drop this preload when we upgrade.
 *
 * Loaded via poolOptions.forks.execArgv --import (worker only; no disk patch
 * of the shared Core node_modules).
 */
import { registerHooks } from "node:module";

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    const apply = (resolved) => {
      if (resolved.format !== "module" || resolved.source == null) return resolved;
      if (!url.includes("/vitest/") || !url.includes("chunks/utils.")) return resolved;

      let source =
        typeof resolved.source === "string"
          ? resolved.source
          : Buffer.from(resolved.source).toString("utf8");
      if (!source.includes("function createForksRpcOptions")) return resolved;

      source = source
        .replace(
          "function createForksRpcOptions(nodeV8) {\n\treturn {",
          "function createForksRpcOptions(nodeV8) {\n\treturn {\n\t\ttimeout: -1,"
        )
        .replace(
          "function createThreadsRpcOptions({ port }) {\n\treturn {",
          "function createThreadsRpcOptions({ port }) {\n\treturn {\n\t\ttimeout: -1,"
        );

      return { ...resolved, source, shortCircuit: true };
    };

    return result && typeof result.then === "function" ? result.then(apply) : apply(result);
  },
});
