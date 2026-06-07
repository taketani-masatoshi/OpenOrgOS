import {
  loadClassificationRegistry,
  checkAgentAccess,
  runClassificationChecks,
  type AccessOperation,
  type AgentId,
} from "../lib/classification.js";
import { agentId } from "../../schemas/classification.js";

export function runClassificationCheck(opts: { json?: boolean }): void {
  const issues = runClassificationChecks();

  if (opts.json) {
    console.log(JSON.stringify({ ok: !issues.some((i) => i.severity === "error"), issues }, null, 2));
    if (issues.some((i) => i.severity === "error")) process.exit(1);
    return;
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (errors.length === 0 && warnings.length === 0) {
    console.log("✓ Classification registry OK");
    return;
  }

  for (const e of errors) console.error(`✗ ${e.message}`);
  for (const w of warnings) console.warn(`⚠ ${w.message}`);

  if (errors.length > 0) process.exit(1);
}

export function runClassificationAccess(
  agent: string,
  path: string,
  operation: string
): void {
  const parsedAgent = agentId.safeParse(agent);
  if (!parsedAgent.success) {
    console.error(`Unknown agent: ${agent}`);
    process.exit(1);
  }
  const op = operation as AccessOperation;
  const registry = loadClassificationRegistry();
  const result = checkAgentAccess(registry, parsedAgent.data, path, op);
  console.log(JSON.stringify(result, null, 2));
  if (!result.allowed) process.exit(1);
}
