import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  workflowDocumentSchema,
  type WorkflowDocument,
} from "../../../schemas/workflow-canvas.js";
import { tenantDataPath } from "../tenant.js";
import { writeYamlFile } from "../utils.js";

export function workflowsDir(): string {
  return tenantDataPath("org", "workflows");
}

export function workflowYamlPath(workflowId: string): string {
  return join(workflowsDir(), `${workflowId}.yaml`);
}

export function loadWorkflowDocument(workflowId: string): WorkflowDocument | null {
  const path = workflowYamlPath(workflowId);
  if (!existsSync(path)) return null;
  const raw = YAML.parse(readFileSync(path, "utf-8"));
  const document = workflowDocumentSchema.parse(raw);
  if (document.workflow_id !== workflowId) {
    throw new Error(
      `workflow_id mismatch: file ${workflowId} declares ${document.workflow_id}`,
    );
  }
  return document;
}

export function listWorkflowDocuments(): WorkflowDocument[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(workflowsDir()).filter(
      (name) => name.endsWith(".yaml") || name.endsWith(".yml"),
    );
  } catch {
    return [];
  }
  const out: WorkflowDocument[] = [];
  for (const name of entries.sort()) {
    const id = name.replace(/\.ya?ml$/, "");
    try {
      const document = loadWorkflowDocument(id);
      if (document) out.push(document);
    } catch {
      /* list endpoints skip malformed; validate CLI reports */
    }
  }
  return out;
}

export function writeWorkflowDocument(document: WorkflowDocument): string {
  const parsed = workflowDocumentSchema.parse(document);
  mkdirSync(workflowsDir(), { recursive: true });
  const path = workflowYamlPath(parsed.workflow_id);
  writeYamlFile(path, parsed);
  return path;
}

export function workflowLogicalPath(workflowId: string): string {
  return `data/org/workflows/${workflowId}.yaml`;
}
