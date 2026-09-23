/**
 * Deterministic draft file scaffold for regulation workflow Work Orders.
 * Writes 草案 MD only — never enables regulations.yaml or overwrites 施行文.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getRegulationsTemplatesDir } from "./jurisdiction.js";
import { getTenantDir } from "./tenant.js";

const DRAFTS_REL_DIR = "docs/company/regulations/drafts";

/** Minimal plan shape (avoids circular import with regulation-module-workflow). */
export interface RegulationDraftPlanInput {
  moduleId: string;
  familyId?: string;
  doNotMutateRegulationIds: string[];
  actions: Array<{
    kind: string;
    llmDraftAllowed: boolean;
    draftTemplate?: string;
    regulationIds: string[];
  }>;
}

export interface RegulationDraftTarget {
  kind: string;
  /** Tenant-relative path (forward slashes). */
  relativePath: string;
  absolutePath: string;
  /** Pack-relative scaffold (e.g. FORK-DRAFT.md), if any. */
  scaffoldSource?: string;
}

export interface ScaffoldRegulationDraftResult {
  targets: RegulationDraftTarget[];
  created: string[];
  skipped: string[];
  /** Primary path for Work Order context.path (first created or existing). */
  primaryRelativePath?: string;
}

function draftsAbsDir(): string {
  return join(getTenantDir(), ...DRAFTS_REL_DIR.split("/"));
}

function actionKindsNeedingDraft(plan: RegulationDraftPlanInput): {
  kind: string;
  scaffoldSource?: string;
  regulationIds: string[];
}[] {
  return plan.actions
    .filter((a) => a.llmDraftAllowed && a.kind !== "none" && a.kind !== "reuse")
    .map((a) => ({
      kind: a.kind,
      scaffoldSource: a.draftTemplate,
      regulationIds: a.regulationIds,
    }));
}

export function resolveRegulationDraftTargets(
  plan: RegulationDraftPlanInput
): RegulationDraftTarget[] {
  const out: RegulationDraftTarget[] = [];
  for (const item of actionKindsNeedingDraft(plan)) {
    const file = `${plan.moduleId}-${item.kind}-草案.md`;
    const relativePath = `${DRAFTS_REL_DIR}/${file}`;
    out.push({
      kind: item.kind,
      relativePath,
      absolutePath: join(getTenantDir(), ...relativePath.split("/")),
      scaffoldSource: item.scaffoldSource,
    });
  }
  return out;
}

function buildDraftBody(
  plan: RegulationDraftPlanInput,
  target: RegulationDraftTarget,
  regulationIds: string[]
): string {
  let reference = "";
  if (target.scaffoldSource) {
    const abs = join(getRegulationsTemplatesDir(), target.scaffoldSource);
    if (existsSync(abs)) {
      reference = [
        "",
        "## Reference scaffold (do not treat as 施行)",
        "",
        "```markdown",
        readFileSync(abs, "utf-8").trimEnd(),
        "```",
        "",
      ].join("\n");
    } else {
      reference = `\n## Reference scaffold\n\nMissing pack file: \`${target.scaffoldSource}\`\n\n`;
    }
  } else if (regulationIds.length) {
    reference = [
      "",
      "## Pack templates to thicken (read-only)",
      "",
      ...regulationIds.map((id) => `- \`${id}\``),
      "",
    ].join("\n");
  }

  const doNot = plan.doNotMutateRegulationIds.length
    ? plan.doNotMutateRegulationIds.map((id) => `\`${id}\``).join(", ")
    : "—";

  return [
    `# ${plan.moduleId} · ${target.kind}（草案）`,
    "",
    "**状態:** 草案 · **未施行**",
    `**Module:** \`${plan.moduleId}\`${plan.familyId ? ` · **Family:** \`${plan.familyId}\`` : ""}`,
    `**Do not mutate 施行文:** ${doNot}`,
    "",
    "## LLM constraints",
    "",
    "- Draft only in this file (or clearly marked sibling drafts).",
    "- Do not edit `regulations.yaml` enabled flags.",
    "- Do not overwrite tenant 施行文 listed in Do not mutate.",
    "- Do not claim board approval.",
    "",
    "## Draft body",
    "",
    "（ここに条文・別紙の草案を書く）",
    "",
    reference,
    "---",
    "",
    `*Scaffolded by regulation workflow · ${new Date().toISOString().slice(0, 10)}*`,
    "",
  ].join("\n");
}

export function scaffoldRegulationDraftFiles(
  plan: RegulationDraftPlanInput,
  opts: { force?: boolean; dryRun?: boolean } = {}
): ScaffoldRegulationDraftResult {
  const needing = actionKindsNeedingDraft(plan);
  const targets = resolveRegulationDraftTargets(plan);
  const created: string[] = [];
  const skipped: string[] = [];

  if (opts.dryRun || targets.length === 0) {
    return {
      targets,
      created,
      skipped: targets.map((t) => t.relativePath),
      primaryRelativePath: targets[0]?.relativePath,
    };
  }

  mkdirSync(draftsAbsDir(), { recursive: true });
  const readme = join(draftsAbsDir(), "00-このフォルダについて.md");
  if (!existsSync(readme)) {
    writeFileSync(
      readme,
      [
        "# 社内規程・草案（未施行）",
        "",
        "モジュール有効化時の規程ワークフローが置く **LLM / 人間向け草案**。",
        "`regulations.yaml` で enabled にするまで施行文ではない。",
        "",
        "Git: このディレクトリは `.gitignore`（README のみ追跡可）。",
        "",
      ].join("\n"),
      "utf-8"
    );
  }

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!;
    const meta = needing[i]!;
    if (existsSync(target.absolutePath) && !opts.force) {
      skipped.push(target.relativePath);
      continue;
    }
    mkdirSync(dirname(target.absolutePath), { recursive: true });
    writeFileSync(
      target.absolutePath,
      buildDraftBody(plan, target, meta.regulationIds),
      "utf-8"
    );
    created.push(target.relativePath);
  }

  const primary = created[0] ?? skipped[0] ?? targets[0]?.relativePath;

  return { targets, created, skipped, primaryRelativePath: primary };
}
