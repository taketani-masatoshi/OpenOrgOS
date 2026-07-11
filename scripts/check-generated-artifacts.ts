#!/usr/bin/env node
import { validateGeneratedArtifacts } from "../src/lib/generated-artifacts.js";

const issues = validateGeneratedArtifacts();
if (issues.length > 0) {
  for (const issue of issues) console.error(`generated-artifact: ${issue}`);
  process.exitCode = 1;
} else {
  console.log("Generated artifacts are deterministic and current.");
}
