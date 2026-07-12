#!/usr/bin/env node
import { setTenantId } from "../src/lib/tenant.js";
import { validateGeneratedArtifacts } from "../src/lib/generated-artifacts.js";
import { validatePolicyMirrors } from "../src/lib/operator-policy.js";
import { validateAgentPackExports } from "../src/lib/agent-portability.js";
import { validateActiveContextMirror } from "../src/lib/context-manifest.js";

/** Pack skill lists are tenant-scoped — pin the repo reference tenant for CI. */
if (!process.env.ORGOS_TENANT?.trim() && !process.env.STEWARD_TENANT?.trim()) {
  setTenantId("mal");
}

const issues = [
  ...validateGeneratedArtifacts(),
  ...validatePolicyMirrors(),
  ...validateAgentPackExports(),
  ...validateActiveContextMirror(),
];
if (issues.length > 0) {
  for (const issue of issues) console.error(`generated-artifact: ${issue}`);
  process.exitCode = 1;
} else {
  console.log("Generated artifacts are deterministic and current.");
}
