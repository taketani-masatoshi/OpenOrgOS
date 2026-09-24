/**
 * Node --import loader for Node 20 (no registerHooks).
 * Patches Vitest birpc RPC timeout in worker utils chunks.
 */
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.format !== "module" || result.source == null) return result;
  if (!url.includes("/vitest/") || !url.includes("chunks/utils.")) return result;

  let source =
    typeof result.source === "string" ? result.source : Buffer.from(result.source).toString("utf8");
  if (!source.includes("function createForksRpcOptions")) return result;

  source = source
    .replace(
      "function createForksRpcOptions(nodeV8) {\n\treturn {",
      "function createForksRpcOptions(nodeV8) {\n\treturn {\n\t\ttimeout: -1,"
    )
    .replace(
      "function createThreadsRpcOptions({ port }) {\n\treturn {",
      "function createThreadsRpcOptions({ port }) {\n\treturn {\n\t\ttimeout: -1,"
    );

  return { ...result, source, shortCircuit: true };
}
