import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { prManifestSchema, type PrManifest } from "../../schemas/cloud-agent.js";
import { collectWorkOrdersForMerge, mergeWorkOrderResults } from "./work-order-merge.js";
import { pushQueueEvent } from "./queue-db.js";
import { appendAuditEvent } from "./audit-log.js";
import { routingQueueDir } from "./routing.js";
import { ROOT_DIR, currentDate, ensureDocsReportsDir, getDocsReportsDir, writeCanonicalFile } from "./utils.js";

export function branchNameForWorkOrder(id: string): string {
  return `steward/${id.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
}

export function findLatestMergeDoc(workOrderId: string): string | undefined {
  const slug = workOrderId.replace(/[^A-Z0-9-]/gi, "");
  const mergePattern = `-merge-${slug}`;
  const dir = join(getDocsReportsDir(), "executive-notes");
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir)
    .filter((f) => f.includes(mergePattern) && f.endsWith(".md"))
    .sort()
    .reverse();
  return files[0] ? join(dir, files[0]) : undefined;
}

export function planPullRequest(id: string, base = "main"): PrManifest {
  const { parent } = collectWorkOrdersForMerge(id);
  const woId = parent?.id ?? id;
  let mergePath = findLatestMergeDoc(woId);
  if (!mergePath) {
    const merged = mergeWorkOrderResults({ id: woId });
    mergePath = merged.path;
  }
  const subject = parent?.subject ?? woId;
  return prManifestSchema.parse({
    id: `PR-${currentDate().replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6)}`,
    work_order_id: woId,
    branch: branchNameForWorkOrder(woId),
    title: `[Steward] ${subject}`,
    body_path: mergePath,
    base,
    created_at: new Date().toISOString(),
    status: "planned",
  });
}

function git(args: string[], cwd = ROOT_DIR): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

function ghAvailable(): boolean {
  return spawnSync("gh", ["--version"], { encoding: "utf-8" }).status === 0;
}

export interface CreatePrOptions {
  id: string;
  base?: string;
  dryRun?: boolean;
  allowEmpty?: boolean;
}

export function createPullRequest(options: CreatePrOptions): PrManifest {
  const manifest = planPullRequest(options.id, options.base ?? "main");
  const body = readFileSync(manifest.body_path, "utf-8");

  pushQueueEvent({
    type: "pr_requested",
    ref: manifest.work_order_id,
    payload: { branch: manifest.branch, pr_id: manifest.id },
  });

  if (options.dryRun) {
    appendAuditEvent({
      event: "escalate",
      ref: manifest.work_order_id,
      detail: `pr:plan:${manifest.branch}`,
    });
    return manifest;
  }

  try {
    const currentBranch = git(["branch", "--show-current"]);
    if (currentBranch !== manifest.branch) {
      try {
        git(["rev-parse", "--verify", manifest.branch]);
        git(["checkout", manifest.branch]);
      } catch {
        git(["checkout", "-b", manifest.branch]);
      }
    }

    const status = git(["status", "--porcelain"]);
    if (!status && !options.allowEmpty) {
      throw new Error("no staged/unstaged changes — stage files before merge pr create");
    }

    if (status) {
      git(["add", "-A"]);
      git(["commit", "-m", manifest.title]);
    }

    let prUrl: string | undefined;
    if (ghAvailable()) {
      const out = execFileSync(
        "gh",
        [
          "pr",
          "create",
          "--title",
          manifest.title,
          "--body-file",
          manifest.body_path,
          "--base",
          manifest.base,
        ],
        { cwd: ROOT_DIR, encoding: "utf-8" }
      ).trim();
      prUrl = out.split("\n").pop();
    }

    const created = prManifestSchema.parse({
      ...manifest,
      status: "created",
      pr_url: prUrl,
    });

    const prPath = join(routingQueueDir(), `${created.id}.yaml`);
    writeCanonicalFile(prPath, JSON.stringify(created, null, 2));

    pushQueueEvent({
      type: "pr_created",
      ref: manifest.work_order_id,
      status: "done",
      payload: { pr_url: prUrl, branch: manifest.branch },
    });

    appendAuditEvent({
      event: "escalate",
      ref: manifest.work_order_id,
      detail: prUrl ? `pr:${prUrl}` : `pr:branch:${manifest.branch}`,
    });

    return created;
  } catch (err) {
    const failed = prManifestSchema.parse({
      ...manifest,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { manifest: failed });
  }
}

export function formatPrPlan(manifest: PrManifest): string {
  const lines = [
    `# PR Plan · ${manifest.id}`,
    "",
    `**Work Order:** ${manifest.work_order_id}`,
    `**Branch:** ${manifest.branch}`,
    `**Base:** ${manifest.base}`,
    `**Title:** ${manifest.title}`,
    `**Body:** ${manifest.body_path}`,
    "",
    "## Commands (manual)",
    "",
    "```bash",
    `git checkout -b ${manifest.branch}`,
    `# … stage changes …`,
    `git commit -m "${manifest.title}"`,
    `gh pr create --title "${manifest.title}" --body-file ${manifest.body_path} --base ${manifest.base}`,
    "```",
    "",
  ];
  return lines.join("\n");
}
