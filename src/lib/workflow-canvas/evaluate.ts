import {
  workflowDocumentSchema,
  type WorkflowDocument,
} from "../../../schemas/workflow-canvas.js";
import type { WorkflowFinding } from "../../../schemas/workflow-structure-change.js";
import { getCatalogAgent, resolveAgentId } from "../agent-catalog.js";
import { isRosterAgentActive, loadTenantAgentRoster } from "../agent-roster.js";
import {
  listCatalogModuleIds,
  loadEnabledModulesSafe,
} from "../modules.js";
import { annotateDependencies } from "./serialize.js";

/** Product surfaces that may appear as system_module without a catalog module id. */
export const PLATFORM_MODULE_IDS = new Set([
  "steward-chat",
  "wire",
  "operator-console",
]);

export type WorkflowEvaluateResult = {
  document: WorkflowDocument;
  findings: WorkflowFinding[];
  proposed_document: WorkflowDocument;
  ok: boolean;
};

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Deterministic evaluation of a workflow draft.
 * LLM is never invoked here — callers may overlay a fixture proposal via
 * {@link applyLlmProposalOverlay}.
 */
export function evaluateWorkflowDocument(input: unknown): WorkflowEvaluateResult {
  const document = workflowDocumentSchema.parse(input);
  const findings: WorkflowFinding[] = [];

  const nodeIds = new Set<string>();
  for (const node of document.nodes) {
    if (nodeIds.has(node.id)) {
      findings.push({
        code: "duplicate_node_id",
        severity: "error",
        message: `duplicate node id: ${node.id}`,
        node_id: node.id,
      });
    }
    nodeIds.add(node.id);
  }

  const edgeIds = new Set<string>();
  const connected = new Set<string>();
  for (const edge of document.edges) {
    if (edgeIds.has(edge.id)) {
      findings.push({
        code: "duplicate_edge_id",
        severity: "error",
        message: `duplicate edge id: ${edge.id}`,
        edge_id: edge.id,
      });
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.source)) {
      findings.push({
        code: "missing_edge_source",
        severity: "error",
        message: `edge ${edge.id} source missing: ${edge.source}`,
        edge_id: edge.id,
      });
    } else {
      connected.add(edge.source);
    }
    if (!nodeIds.has(edge.target)) {
      findings.push({
        code: "missing_edge_target",
        severity: "error",
        message: `edge ${edge.id} target missing: ${edge.target}`,
        edge_id: edge.id,
      });
    } else {
      connected.add(edge.target);
    }
    if (edge.source === edge.target) {
      findings.push({
        code: "self_loop",
        severity: "warning",
        message: `edge ${edge.id} is a self-loop on ${edge.source}`,
        edge_id: edge.id,
        node_id: edge.source,
      });
    }
  }

  const annotated = annotateDependencies(
    document.nodes.map(({ sources: _s, targets: _t, ...rest }) => rest),
    document.edges,
  );
  for (const node of document.nodes) {
    const expected = annotated.find((n) => n.id === node.id);
    if (!expected) continue;
    if (
      !arraysEqual([...node.sources].sort(), expected.sources) ||
      !arraysEqual([...node.targets].sort(), expected.targets)
    ) {
      findings.push({
        code: "sources_targets_mismatch",
        severity: "warning",
        message: `node ${node.id} sources/targets do not match edges (will be repaired)`,
        node_id: node.id,
      });
    }
  }

  for (const node of document.nodes) {
    if (!connected.has(node.id) && document.nodes.length > 1) {
      findings.push({
        code: "isolated_node",
        severity: "warning",
        message: `node ${node.id} has no edges`,
        node_id: node.id,
      });
    }
  }

  let rosterActive: Set<string> | null = null;
  try {
    const { roster } = loadTenantAgentRoster();
    rosterActive = new Set(
      roster.profiles.operational.filter((id) => isRosterAgentActive(id)),
    );
  } catch {
    rosterActive = null;
  }

  const catalogModules = new Set(listCatalogModuleIds());
  const enabledModules = new Set(loadEnabledModulesSafe().map((m) => m.id));

  for (const node of document.nodes) {
    const agentId = node.data?.agent_id;
    if (agentId) {
      const resolved = resolveAgentId(agentId) ?? agentId;
      if (!getCatalogAgent(resolved)) {
        findings.push({
          code: "unknown_agent_id",
          severity: "error",
          message: `unknown agent_id: ${agentId}`,
          node_id: node.id,
        });
      } else if (rosterActive && !rosterActive.has(resolved) && !rosterActive.has(agentId)) {
        findings.push({
          code: "inactive_agent_id",
          severity: "warning",
          message: `agent_id ${agentId} is not active on this tenant roster`,
          node_id: node.id,
        });
      }
    }

    const moduleId = node.data?.module_id;
    if (moduleId) {
      if (PLATFORM_MODULE_IDS.has(moduleId)) {
        findings.push({
          code: "platform_module_id",
          severity: "info",
          message: `module_id ${moduleId} is a platform surface (not a catalog module)`,
          node_id: node.id,
        });
      } else if (!catalogModules.has(moduleId)) {
        findings.push({
          code: "unknown_module_id",
          severity: "error",
          message: `unknown module_id: ${moduleId}`,
          node_id: node.id,
        });
      } else if (!enabledModules.has(moduleId)) {
        findings.push({
          code: "disabled_module_id",
          severity: "warning",
          message: `module_id ${moduleId} is in catalog but not enabled`,
          node_id: node.id,
        });
      }
    }
  }

  const proposed_document = buildDeterministicProposal(document);
  const ok = !findings.some((f) => f.severity === "error");
  return { document, findings, proposed_document, ok };
}

/** Drop dangling edges and recompute sources/targets. */
export function buildDeterministicProposal(document: WorkflowDocument): WorkflowDocument {
  const nodeIds = new Set(document.nodes.map((n) => n.id));
  const edges = document.edges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .sort((a, b) => a.id.localeCompare(b.id));
  const bareNodes = document.nodes
    .map(({ sources: _s, targets: _t, ...rest }) => rest)
    .sort((a, b) => a.id.localeCompare(b.id));
  return workflowDocumentSchema.parse({
    ...document,
    nodes: annotateDependencies(bareNodes, edges),
    edges,
  });
}

/**
 * Optional LLM overlay: parse a candidate document (fixture or model output).
 * On parse failure, return the deterministic proposal unchanged.
 */
export function applyLlmProposalOverlay(
  deterministic: WorkflowDocument,
  llmCandidate: unknown,
): { proposed_document: WorkflowDocument; used_llm: boolean; error?: string } {
  try {
    const parsed = workflowDocumentSchema.parse(llmCandidate);
    if (parsed.workflow_id !== deterministic.workflow_id) {
      return {
        proposed_document: deterministic,
        used_llm: false,
        error: `LLM proposal workflow_id mismatch: ${parsed.workflow_id}`,
      };
    }
    return {
      proposed_document: buildDeterministicProposal(parsed),
      used_llm: true,
    };
  } catch (cause) {
    return {
      proposed_document: deterministic,
      used_llm: false,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export function evaluateWorkflowDocumentWithOptionalLlm(
  input: unknown,
  opts?: { llm_proposal?: unknown },
): WorkflowEvaluateResult & { used_llm: boolean; llm_error?: string } {
  const base = evaluateWorkflowDocument(input);
  if (opts?.llm_proposal === undefined) {
    return { ...base, used_llm: false };
  }
  const overlay = applyLlmProposalOverlay(base.proposed_document, opts.llm_proposal);
  return {
    ...base,
    proposed_document: overlay.proposed_document,
    used_llm: overlay.used_llm,
    ...(overlay.error ? { llm_error: overlay.error } : {}),
  };
}
