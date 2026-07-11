#!/usr/bin/env node
import { validateSkillDispatchReachability } from "../src/lib/skill-dispatch-verify.js";
import { resolveRegisteredSkillInvocation } from "../src/commands/skills.js";

const issues = validateSkillDispatchReachability(resolveRegisteredSkillInvocation);
if (issues.length) {
  console.error("Skill dispatch check: FAILED");
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}
console.log("Skill dispatch check: OK");
