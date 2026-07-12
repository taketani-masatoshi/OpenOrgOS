#!/usr/bin/env node
import { syncAgentDocs } from "../src/lib/agent-docs-sync.js";

const write = process.argv.includes("--write");
const check = process.argv.includes("--check");
const result = syncAgentDocs(write);

if (check && !write) {
  const { validateAgentDocsGeneratedDrift } = await import("../src/lib/agent-docs-sync.js");
  const issues = validateAgentDocsGeneratedDrift();
  if (issues.length) {
    for (const issue of issues) console.error(issue);
    process.exitCode = 1;
  } else {
    console.log("Agent docs generated sections: current");
  }
} else {
  console.log(
    `Agent docs ${write ? "synced" : "preview"} (org-chart · roster · skill-delegation generated sections)`
  );
}
