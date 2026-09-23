import type { DispatchManifest } from "../../../../schemas/queue.js";

export function formatDispatchPlan(manifest: DispatchManifest): string {
  const lines = [
    `# Dispatch Plan · ${manifest.id}`,
    "",
    `**Tenant:** ${manifest.tenant}`,
    `**Tasks:** ${manifest.tasks.length}`,
    `**Parallel:** ${manifest.parallel}`,
    `**Trace:** ${manifest.trace_id ?? "—"}`,
    `**Cursor SDK:** ${manifest.cursor_sdk_available ? "yes" : "no (manifest only)"}`,
    "",
    "| work_order | agent | mode | attempt | prompt |",
    "|------------|-------|------|---------|--------|",
    ...manifest.tasks.map(
      (t) =>
        `| ${t.work_order_id} | ${t.agent} | ${t.mode} | ${t.attempt ?? "—"} | ${t.prompt_relative ?? "—"} |`,
    ),
    "",
  ];
  if (!manifest.cursor_sdk_available) {
    lines.push(
      "## Portable dispatch (no Cursor SDK)",
      "",
      "1. `orgos agent implement --id <IMP-...>` — LLM API / Aider / shell",
      "2. `orgos orchestrate run --id <IMP-...>` — wave-aware dispatch",
      "3. Prompt MD includes full agent definition (tool-neutral)",
      "",
      "Optional Cursor: `npm install @cursor/sdk` + `CURSOR_API_KEY`",
      "",
    );
  }
  return lines.join("\n");
}
