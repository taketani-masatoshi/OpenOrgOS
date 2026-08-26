import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  changeIntentSchema,
  changeProposalSchema,
  type ChangeEdit,
  type ChangeIntent,
  type ChangeProposal,
} from "../../../schemas/operator-change.js";
import { computeImpact, loadDependencyGraph } from "../dependency-graph.js";
import { getClock } from "../runtime-context.js";
import { getDataDir, getDocsDir } from "../utils.js";
import { tenantDataPath } from "../tenant.js";
import { appendJsonl } from "../jsonl-store.js";

/** Grade A fixed whitelist — hospitality SSOT + derived sync targets. */
export const GRADE_A_WHITELIST = [
  "data/properties/PROP-002.yaml",
  "data/operations/kamezawa-public.yaml",
  "data/hospitality/operations-public.yaml",
  "docs/properties/PROP-002-kamezawa/operations/templates/guest-facing/ハウスルール.md",
  "docs/properties/PROP-002-kamezawa/operations/templates/guest-facing/house-rules.md",
  "docs/properties/PROP-002-kamezawa/operations/templates/guest-facing/welcome-sheet.md",
  "docs/properties/PROP-002-kamezawa/operations/templates/guest-facing/宿泊約款・ハウスルール.md",
] as const;

const DUMMY_RE = /ダミー|dummy|REPLACE_ME|TBD/i;

function newProposalId(): string {
  const stamp = getClock().now().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `CHG-${stamp}`;
}

function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function collectAllowPaths(seedPaths: string[]): string[] {
  const allow = new Set<string>(GRADE_A_WHITELIST.map(normalizeRepoPath));
  let graph;
  try {
    graph = loadDependencyGraph();
  } catch {
    return [...allow];
  }
  for (const seed of seedPaths) {
    allow.add(normalizeRepoPath(seed));
    try {
      const { impacts } = computeImpact(graph, seed);
      for (const item of impacts) {
        const p =
          item.path ??
          (item.nodeId.startsWith("data/") || item.nodeId.startsWith("docs/")
            ? item.nodeId
            : undefined);
        if (p) allow.add(normalizeRepoPath(p));
      }
    } catch {
      /* ignore unresolved seeds */
    }
  }
  return [...allow].sort();
}

function buildEditsFromIntent(intent: ChangeIntent): {
  edits: ChangeEdit[];
  sync_derived: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  const edits: ChangeEdit[] = [...intent.edits];
  let sync_derived = intent.intent_id === "sync_derived";

  if (intent.intent_id === "set_opened_date") {
    if (!intent.opened_date) {
      throw new Error("set_opened_date requires opened_date");
    }
    edits.push({
      path: "data/properties/PROP-002.yaml",
      field: "hotel.opened_date",
      value: intent.opened_date,
    });
  }
  if (intent.intent_id === "set_max_guests") {
    if (intent.max_guests == null) {
      throw new Error("set_max_guests requires max_guests");
    }
    edits.push({
      path: "data/operations/kamezawa-public.yaml",
      field: "max_guests",
      value: intent.max_guests,
    });
    sync_derived = true;
  }
  if (intent.intent_id === "sync_derived") {
    sync_derived = true;
  }

  for (const edit of edits) {
    const text = `${edit.path} ${edit.field} ${String(edit.value)} ${intent.summary} ${intent.notes ?? ""}`;
    if (DUMMY_RE.test(text)) {
      warnings.push(`proposal text contains forbidden token near ${edit.path}#${edit.field}`);
    }
  }
  return { edits, sync_derived, warnings };
}

export function planOperatorChange(raw: unknown): ChangeProposal {
  const intent = changeIntentSchema.parse(raw);
  const { edits, sync_derived, warnings } = buildEditsFromIntent(intent);
  const seedPaths = edits.map((e) => e.path);
  if (sync_derived) seedPaths.push("data/operations/kamezawa-public.yaml");
  const allow_paths = collectAllowPaths(seedPaths);

  const blocked: string[] = [];
  for (const edit of edits) {
    const p = normalizeRepoPath(edit.path);
    if (intent.grade === "A" && !GRADE_A_WHITELIST.map(normalizeRepoPath).includes(p)) {
      blocked.push(`grade A path not in whitelist: ${p}`);
    }
    if (!allow_paths.includes(p)) {
      blocked.push(`path not allowed by deps/whitelist: ${p}`);
    }
  }

  if (intent.grade === "C") {
    blocked.push("grade C is plan-only; apply is forbidden");
  }

  for (const w of warnings) {
    if (w.includes("forbidden token")) {
      blocked.push(w);
    }
  }

  const proposal = changeProposalSchema.parse({
    proposal_id: newProposalId(),
    created_at: getClock().now().toISOString(),
    grade: intent.grade,
    summary: intent.summary,
    intent_id: intent.intent_id,
    allow_paths,
    proposed_edits: edits,
    sync_derived,
    status: blocked.length ? "rejected" : "planned",
    warnings: [
      ...warnings,
      ...(intent.grade === "B" ? ["grade B requires --i-understand-grade-b to apply"] : []),
    ],
    blocked_reason: blocked.length ? blocked.join("; ") : undefined,
  });

  appendChangeAudit({
    event: "plan",
    proposal_id: proposal.proposal_id,
    grade: proposal.grade,
    summary: proposal.summary,
    status: proposal.status,
    at: proposal.created_at,
  });

  return proposal;
}

export function proposalsDir(): string {
  return tenantDataPath("operator", "change-proposals");
}

export function saveChangeProposal(proposal: ChangeProposal): string {
  const dir = proposalsDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${proposal.proposal_id}.yaml`);
  writeFileSync(path, YAML.stringify(proposal), "utf-8");
  return path;
}

export function loadChangeProposal(fileOrId: string): ChangeProposal {
  const path =
    fileOrId.endsWith(".yaml") || fileOrId.endsWith(".yml")
      ? fileOrId
      : join(proposalsDir(), `${fileOrId}.yaml`);
  if (!existsSync(path)) {
    throw new Error(`proposal not found: ${fileOrId}`);
  }
  return changeProposalSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

export function changeAuditPath(): string {
  return tenantDataPath("operator", "change-audit.jsonl");
}

export function appendChangeAudit(record: Record<string, unknown>): void {
  appendJsonl(changeAuditPath(), record);
}

export function formatChangeProposal(proposal: ChangeProposal): string {
  const lines = [
    `# Change proposal ${proposal.proposal_id}`,
    "",
    `- grade: ${proposal.grade}`,
    `- status: ${proposal.status}`,
    `- summary: ${proposal.summary}`,
    `- intent: ${proposal.intent_id}`,
    `- sync_derived: ${proposal.sync_derived}`,
    "",
    "## Proposed edits",
    "",
    "| path | field | value |",
    "|------|-------|-------|",
  ];
  for (const e of proposal.proposed_edits) {
    lines.push(`| ${e.path} | ${e.field} | ${JSON.stringify(e.value)} |`);
  }
  if (proposal.warnings.length) {
    lines.push("", "## Warnings", ...proposal.warnings.map((w) => `- ${w}`));
  }
  if (proposal.blocked_reason) {
    lines.push("", `**Blocked:** ${proposal.blocked_reason}`);
  }
  lines.push("", "## Allow paths", ...proposal.allow_paths.map((p) => `- ${p}`));
  return lines.join("\n") + "\n";
}

/** Resolve abs path for a repo-relative data/docs path under active tenant. */
export function resolveTenantRelPath(rel: string): string {
  const normalized = normalizeRepoPath(rel);
  if (normalized.startsWith("data/")) {
    return join(getDataDir(), normalized.slice("data/".length));
  }
  if (normalized.startsWith("docs/")) {
    return join(getDocsDir(), normalized.slice("docs/".length));
  }
  return join(getDataDir(), "..", normalized);
}
