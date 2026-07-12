import {
  loadClassificationRegistry,
  checkAgentAccess,
  runClassificationChecks,
  aiBoundaryPatterns,
  validateCursorignoreCoverage,
  validateCursorindexingignoreCoverage,
  type AccessOperation,
} from "../lib/classification.js";
import { appendAuditEvent } from "../lib/audit-log.js";
import { agentId } from "../../schemas/classification.js";

export function runClassificationCheck(opts: { json?: boolean }): void {
  const issues = runClassificationChecks();

  if (opts.json) {
    console.log(
      JSON.stringify({ ok: !issues.some((i) => i.severity === "error"), issues }, null, 2)
    );
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

/**
 * Show (or --check) the AI-boundary patterns derived from the registry. These
 * are the entries that `.cursorignore` / `.cursorindexingignore` must contain.
 */
export function runClassificationBoundaries(opts: { check?: boolean; json?: boolean }): void {
  const registry = loadClassificationRegistry();
  const patterns = aiBoundaryPatterns(registry);
  const issues = [...validateCursorignoreCoverage(), ...validateCursorindexingignoreCoverage()];

  if (opts.json) {
    console.log(JSON.stringify({ patterns, issues, ok: issues.length === 0 }, null, 2));
    if (opts.check && issues.length > 0) process.exit(1);
    return;
  }

  console.log(
    "# AI 境界パターン（registry 駆動 · .cursorignore / .cursorindexingignore に必要）\n"
  );
  for (const p of patterns) {
    console.log(`${p.path}    # ${p.id} (${p.level})`);
  }

  if (opts.check) {
    if (issues.length === 0) {
      console.log("\n✓ .cursorignore / .cursorindexingignore は registry と整合");
    } else {
      for (const i of issues) console.warn(`⚠ ${i.message}`);
      process.exit(1);
    }
  }
}

export function runClassificationAccess(agent: string, path: string, operation: string): void {
  const parsedAgent = agentId.safeParse(agent);
  if (!parsedAgent.success) {
    console.error(`Unknown agent: ${agent}`);
    process.exit(1);
  }
  const op = operation as AccessOperation;
  const registry = loadClassificationRegistry();
  const result = checkAgentAccess(registry, parsedAgent.data, path, op);
  console.log(JSON.stringify(result, null, 2));
  if (!result.allowed) {
    appendAuditEvent({
      event: "classification_block",
      ref: path,
      actor: agent,
      detail: result.reason,
    });
    process.exit(1);
  }
}
