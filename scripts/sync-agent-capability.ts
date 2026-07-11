#!/usr/bin/env node
import {
  syncAgentCapabilityManifest,
  validateCapabilityManifestDrift,
} from "../src/lib/agent-capability-sync.js";

const write = process.argv.includes("--write");
const check = process.argv.includes("--check");

if (check && !write) {
  const issues = validateCapabilityManifestDrift();
  if (issues.length) {
    for (const issue of issues) console.error(issue);
    process.exitCode = 1;
  } else {
    console.log("Capability manifest: current");
  }
} else {
  const manifest = syncAgentCapabilityManifest(write);
  console.log(
    `Capability manifest: ${manifest.agents.length} agents${write ? " (written)" : " (dry-run)"}`
  );
}
