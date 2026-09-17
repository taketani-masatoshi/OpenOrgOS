import { readFileSync } from "node:fs";
import YAML from "yaml";
import {
  applyWorkflowStructureChangeProposal,
  describeWorkflowStructureChangeProposal,
  documentToMermaid,
  evaluateWorkflowDocument,
  evaluateWorkflowDocumentWithOptionalLlm,
  formatWorkflowTableText,
  listWorkflowDocuments,
  listWorkflowStructureChangeProposals,
  loadWorkflowDocument,
  loadWorkflowStructureChangeProposal,
  proposeWorkflowStructureChange,
  stringifyWorkflowDocument,
  validateWorkflowStructureChangeProposal,
  workflowChangesDir,
} from "../lib/workflow-canvas/index.js";
import { readdirSync } from "node:fs";
import { join } from "node:path";

export type WorkflowRenderFormat = "json" | "table" | "mermaid";

export function runWorkflowList(opts?: { json?: boolean }): void {
  const documents = listWorkflowDocuments();
  if (opts?.json) {
    console.log(JSON.stringify({ ok: true, documents }, null, 2));
    return;
  }
  if (documents.length === 0) {
    console.log("No workflows under data/org/workflows/");
    return;
  }
  for (const doc of documents) {
    console.log(
      `${doc.workflow_id} · ${doc.kind} · ${doc.title} · nodes=${doc.nodes.length} edges=${doc.edges.length}`,
    );
  }
}

export function runWorkflowGet(opts: { id: string; json?: boolean }): void {
  const document = loadWorkflowDocument(opts.id);
  if (!document) {
    console.error(`workflow not found: ${opts.id}`);
    process.exitCode = 1;
    return;
  }
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, document }, null, 2));
    return;
  }
  console.log(YAML.stringify(document));
}

/** Read-only projection for agents / audits (does not mutate SSOT). */
export function runWorkflowRender(opts: {
  id: string;
  format: WorkflowRenderFormat;
}): void {
  const document = loadWorkflowDocument(opts.id);
  if (!document) {
    console.error(`workflow not found: ${opts.id}`);
    process.exitCode = 1;
    return;
  }
  if (opts.format === "json") {
    process.stdout.write(stringifyWorkflowDocument(document));
    return;
  }
  if (opts.format === "table") {
    process.stdout.write(formatWorkflowTableText(document));
    return;
  }
  process.stdout.write(documentToMermaid(document));
}

export function runWorkflowEvaluate(opts: {
  file?: string;
  id?: string;
  llmFile?: string;
  json?: boolean;
}): void {
  let input: unknown;
  if (opts.file) {
    const raw = readFileSync(opts.file, "utf-8");
    input = opts.file.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw);
  } else if (opts.id) {
    const document = loadWorkflowDocument(opts.id);
    if (!document) {
      console.error(`workflow not found: ${opts.id}`);
      process.exitCode = 1;
      return;
    }
    input = document;
  } else {
    console.error("provide --file or --id");
    process.exitCode = 1;
    return;
  }

  let llm_proposal: unknown | undefined;
  if (opts.llmFile) {
    const raw = readFileSync(opts.llmFile, "utf-8");
    llm_proposal = opts.llmFile.endsWith(".json") ? JSON.parse(raw) : YAML.parse(raw);
  }

  const result =
    llm_proposal === undefined
      ? { ...evaluateWorkflowDocument(input), used_llm: false as const }
      : evaluateWorkflowDocumentWithOptionalLlm(input, { llm_proposal });

  if (opts.json) {
    console.log(JSON.stringify({ ok: result.ok, ...result }, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }

  console.log(
    result.ok
      ? `✓ evaluate ok · findings=${result.findings.length}`
      : `✗ evaluate has errors · findings=${result.findings.length}`,
  );
  for (const finding of result.findings) {
    console.log(`  [${finding.severity}] ${finding.code}: ${finding.message}`);
  }
  if (result.used_llm) {
    console.log("  llm overlay: applied");
  } else if ("llm_error" in result && result.llm_error) {
    console.log(`  llm overlay skipped: ${result.llm_error}`);
  }
  if (!result.ok) process.exitCode = 1;
}

export function runWorkflowChangePropose(opts: {
  file: string;
  approval: string;
  operator: string;
  json?: boolean;
}): void {
  const input = YAML.parse(readFileSync(opts.file, "utf-8"));
  const proposal = proposeWorkflowStructureChange({
    input,
    approvalId: opts.approval,
    proposedBy: opts.operator,
  });
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, proposal }, null, 2));
    return;
  }
  console.log(`✓ proposed ${describeWorkflowStructureChangeProposal(proposal)}`);
  console.log(`  data/org/workflow-changes/${proposal.change_id}.yaml`);
}

export function collectWorkflowChangeValidationIssues(): Array<{
  file: string;
  message: string;
}> {
  const dir = workflowChangesDir();
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"));
  } catch {
    return [];
  }
  const issues: Array<{ file: string; message: string }> = [];
  for (const name of entries) {
    const file = join(dir, name);
    try {
      validateWorkflowStructureChangeProposal(YAML.parse(readFileSync(file, "utf-8")));
    } catch (error) {
      issues.push({
        file: `data/org/workflow-changes/${name}`,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return issues;
}

export function runWorkflowChangeValidate(opts: { file?: string; json?: boolean }): void {
  if (opts.file) {
    const proposal = validateWorkflowStructureChangeProposal(
      YAML.parse(readFileSync(opts.file, "utf-8")),
    );
    const summary = describeWorkflowStructureChangeProposal(proposal);
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, proposal, summary }, null, 2));
      return;
    }
    console.log(`✓ ${summary}`);
    return;
  }

  const issues = collectWorkflowChangeValidationIssues();
  if (opts.json) {
    console.log(JSON.stringify({ ok: issues.length === 0, issues }, null, 2));
    if (issues.length) process.exitCode = 1;
    return;
  }
  if (issues.length === 0) {
    console.log("✓ No workflow change proposals (or all valid).");
    return;
  }
  console.error("✗ Workflow change validation failed:");
  for (const issue of issues) {
    console.error(`  ${issue.file}: ${issue.message}`);
  }
  process.exit(1);
}

export function runWorkflowChangeApply(opts: {
  file: string;
  operator: string;
  dryRun?: boolean;
  json?: boolean;
}): void {
  const proposal = validateWorkflowStructureChangeProposal(
    YAML.parse(readFileSync(opts.file, "utf-8")),
  );
  const result = applyWorkflowStructureChangeProposal({
    proposal,
    appliedBy: opts.operator,
    dryRun: opts.dryRun,
  });
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, proposal, result }, null, 2));
    return;
  }
  if (result.dry_run) {
    console.log(`✓ dry-run ${describeWorkflowStructureChangeProposal(proposal)}`);
    console.log(
      `  before ${result.before_hash.slice(0, 20)}… → after ${result.after_hash.slice(0, 20)}…`,
    );
    return;
  }
  console.log(`✓ applied ${describeWorkflowStructureChangeProposal(proposal)}`);
  console.log(`  ${result.logical_path}`);
}

/** Skill entry: evaluate a workflow file or id (read-only). */
export function runWorkflowEvaluateSkill(opts: {
  file?: string;
  id?: string;
  json?: boolean;
}): void {
  runWorkflowEvaluate(opts);
}

export { listWorkflowStructureChangeProposals, loadWorkflowStructureChangeProposal };
