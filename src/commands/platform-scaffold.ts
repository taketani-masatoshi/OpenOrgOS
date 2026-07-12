import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "../lib/tenant.js";

export type PlatformScaffoldKind = "agent" | "skill" | "module";

export interface PlatformScaffoldOptions {
  kind: PlatformScaffoldKind;
  id: string;
  write?: boolean;
}

function scaffoldAgent(id: string): { path: string; content: string } {
  const path = join(ROOT_DIR, "steward/core/agents", `${id}_agent.md`);
  const content = [
    `# ${id} Agent`,
    "",
    "**4 層:** Agent — （役割を記載）",
    "",
    "## 目的",
    "",
    "- （担当領域）",
    "",
    "## 禁止",
    "",
    "- L2/L3 を tracked MD に書かない",
    "- 人間承認ゲートの単独実行",
    "",
    "## CLI",
    "",
    "```bash",
    `orgos agent readiness --agent ${id}`,
    `orgos agent pulse --agent ${id}`,
    "```",
    "",
  ].join("\n");
  return { path, content };
}

function scaffoldSkill(id: string): { path: string; content: string } {
  const path = join(ROOT_DIR, "steward/core/skills", `${id}.md`);
  const content = [
    `# Skill: ${id}`,
    "",
    "**runtime:** cli",
    "",
    "## 入力",
    "",
    "- （YAML/CLI 引数）",
    "",
    "## 出力",
    "",
    "- （レポート/ファイル）",
    "",
    "## CLI",
    "",
    "```bash",
    `npm run orgos -- skills run ${id}`,
    "```",
    "",
  ].join("\n");
  return { path, content };
}

function scaffoldModule(id: string): { path: string; content: string } {
  const path = join(ROOT_DIR, "steward/modules", id, "module.manifest.yaml");
  const content = [
    "id: " + id,
    "name: " + id,
    "version: 0.1.0",
    "agent: " + id,
    "data_root: data/" + id.replace(/_/g, "-") + "/",
    "docs_root: docs/" + id.replace(/_/g, "-") + "/",
    "",
  ].join("\n");
  return { path, content };
}

export function runPlatformScaffold(opts: PlatformScaffoldOptions): void {
  const builders: Record<PlatformScaffoldKind, (id: string) => { path: string; content: string }> =
    {
      agent: scaffoldAgent,
      skill: scaffoldSkill,
      module: scaffoldModule,
    };
  const build = builders[opts.kind];
  if (!build) throw new Error(`Unknown scaffold kind: ${opts.kind}`);

  const { path, content } = build(opts.id);
  const rel = path.replace(ROOT_DIR + "/", "");

  if (!opts.write) {
    console.log(`[dry-run] would create ${rel}`);
    console.log("---");
    console.log(content.slice(0, 400) + (content.length > 400 ? "\n..." : ""));
    console.log("---");
    console.log("Re-run with --write to create files.");
    return;
  }

  if (existsSync(path)) {
    console.error(`Already exists: ${rel}`);
    process.exit(1);
  }
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf-8");
  console.log(`Created ${rel}`);
  console.log("Next: update steward/core/agents/registry.yaml and run npm run agent:catalog:sync");
}
