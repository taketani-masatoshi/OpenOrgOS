import { existsSync, readFileSync } from "node:fs";
import YAML from "yaml";
import {
  changeApplyOptionsSchema,
  changeProposalSchema,
  type ChangeApplyOptions,
  type ChangeProposal,
} from "../../../schemas/operator-change.js";
import {
  appendChangeAudit,
  formatChangeProposal,
  GRADE_A_WHITELIST,
  loadChangeProposal,
  resolveTenantRelPath,
  saveChangeProposal,
} from "./plan.js";
import { runHospitalitySyncDerived } from "../../../steward/modules/hospitality/cli/sync-derived.js";
import { getClock } from "../runtime-context.js";
import { writeYamlFile } from "../utils.js";

export type ChangeApplyResult = {
  ok: boolean;
  dry_run: boolean;
  proposal: ChangeProposal;
  written: string[];
  sync?: ReturnType<typeof runHospitalitySyncDerived>;
  error?: string;
};

function setByDotPath(doc: Record<string, unknown>, field: string, value: unknown): void {
  const parts = field.split(".");
  let cur: Record<string, unknown> = doc;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cur[key];
    if (next == null || typeof next !== "object" || Array.isArray(next)) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function applyEditToYaml(relPath: string, field: string, value: unknown, write: boolean): string {
  const abs = resolveTenantRelPath(relPath);
  if (!existsSync(abs)) {
    throw new Error(`file not found: ${relPath}`);
  }
  const raw = YAML.parse(readFileSync(abs, "utf-8")) as Record<string, unknown>;
  setByDotPath(raw, field, value);
  if (write) {
    writeYamlFile(abs, raw);
  }
  return relPath;
}

export function applyOperatorChange(
  proposalInput: ChangeProposal | string,
  optsRaw: Partial<ChangeApplyOptions> = {}
): ChangeApplyResult {
  const opts = changeApplyOptionsSchema.parse(optsRaw);
  const proposal =
    typeof proposalInput === "string"
      ? loadChangeProposal(proposalInput)
      : changeProposalSchema.parse(proposalInput);

  if (proposal.status === "rejected" || proposal.blocked_reason) {
    return {
      ok: false,
      dry_run: true,
      proposal,
      written: [],
      error: proposal.blocked_reason ?? "proposal rejected",
    };
  }

  if (proposal.grade === "C") {
    return {
      ok: false,
      dry_run: true,
      proposal,
      written: [],
      error: "grade C apply is forbidden",
    };
  }

  if (proposal.grade === "B" && opts.write && !opts.i_understand_grade_b) {
    return {
      ok: false,
      dry_run: true,
      proposal,
      written: [],
      error: "grade B apply requires --i-understand-grade-b",
    };
  }

  const write = Boolean(opts.write) && !opts.dry_run;
  const written: string[] = [];

  try {
    for (const edit of proposal.proposed_edits) {
      const whitelistOk =
        proposal.grade !== "A" ||
        GRADE_A_WHITELIST.includes(edit.path as (typeof GRADE_A_WHITELIST)[number]);
      if (!whitelistOk && proposal.grade === "A") {
        throw new Error(`grade A path not allowed: ${edit.path}`);
      }
      if (!proposal.allow_paths.includes(edit.path)) {
        throw new Error(`path not in allow_paths: ${edit.path}`);
      }
      const path = applyEditToYaml(edit.path, edit.field, edit.value, write);
      written.push(`${path}#${edit.field}`);
    }

    let sync: ReturnType<typeof runHospitalitySyncDerived> | undefined;
    if (proposal.sync_derived) {
      sync = runHospitalitySyncDerived({ write, dryRun: !write });
      for (const c of sync.changes) {
        if (c.action === "write") written.push(c.path);
      }
    }

    const next = changeProposalSchema.parse({
      ...proposal,
      status: write ? "applied" : "dry_run_ok",
    });
    if (write) saveChangeProposal(next);

    appendChangeAudit({
      event: write ? "apply" : "dry_run",
      proposal_id: proposal.proposal_id,
      grade: proposal.grade,
      operator_id: opts.operator_id,
      written,
      at: getClock().now().toISOString(),
    });

    return { ok: true, dry_run: !write, proposal: next, written, sync };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendChangeAudit({
      event: "apply_failed",
      proposal_id: proposal.proposal_id,
      error: message,
      at: getClock().now().toISOString(),
    });
    return { ok: false, dry_run: !write, proposal, written, error: message };
  }
}

export function formatChangeApplyResult(result: ChangeApplyResult): string {
  const lines = [
    formatChangeProposal(result.proposal).trimEnd(),
    "",
    `# Apply ${result.ok ? "ok" : "failed"} · ${result.dry_run ? "dry-run" : "write"}`,
  ];
  if (result.error) lines.push(`**Error:** ${result.error}`);
  if (result.written.length) {
    lines.push("", "## Written / would write", ...result.written.map((w) => `- ${w}`));
  }
  return lines.join("\n") + "\n";
}
