/**
 * Promote a `coming_soon` catalog entry to a real pack.
 * The scaffold only emits the shell — core_bindings from the declared profile
 * plus an empty gap table. Domain controls are written by a human, because
 * that is the part a generator cannot know.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadCoreProfile } from "../lib/control-framework.js";
import { findIsoCatalogEntry, isoCatalogPath } from "../lib/iso-catalog.js";
import { getIsoStandardDir } from "../lib/standards.js";

export interface IsoScaffoldOptions {
  dryRun?: boolean;
  json?: boolean;
}

export interface IsoScaffoldPlan {
  id: string;
  dir: string;
  files: { path: string; content: string }[];
  catalog_path: string;
  catalog_patch: string;
}

function renderControlMap(id: string, profile: string): string {
  const bindings = loadCoreProfile(profile);
  const lines = [
    'version: "1"',
    `standard: ${id}`,
    `notes: HLS 共通統制は steward/standards/iso/core/ に集約。ここには ${id} 固有の統制だけを置く。`,
    "core_bindings:",
  ];
  for (const b of bindings) {
    lines.push(`  - work: ${b.work}`, `    clause: "${b.clause}"`);
  }
  lines.push(
    `# TODO: ${id} 固有の領域統制をここに書く（共通の器はコアが持っている）。`,
    "# 00-このフォルダについて.md のギャップ表を埋めてから機械可読化する。",
    "controls: []",
    ""
  );
  return lines.join("\n");
}

function renderIndex(id: string, title: string, year: string, profile: string): string {
  return `# ${id} — ${title}

**版:** ${year} · **コアプロファイル:** ${profile}

\`orgos iso scaffold ${id}\` が生成した雛形。領域統制は人間が書く。

---

## このパックが持つもの

共通の器（適用範囲 · 方針 · リスク · 目標 · 力量 · 文書 · 運用 · 内部監査 · MR · 是正）は
[core/](../core/00-このフォルダについて.md) にある。\`control-map.yaml\` の \`core_bindings\` が
${id} の条項番号をコアに結び付ける。

ここに書くのは **${id} にしか無い仕事** だけ。

---

## ギャップ表

| 条項 | 要求事項 | OOO の現状 | 統制 ID |
| --- | --- | --- | --- |
| | | | |

---

## 次の手順

1. 上のギャップ表を埋める
2. \`control-map.yaml\` の \`controls:\` に領域統制を追加する
3. \`orgos iso maps verify\` で検証する
4. テナントで有効化する（\`standards.yaml\`）
`;
}

/**
 * Flip status/encoding inside one catalog entry without reserializing the file,
 * so the comments and roadmap tiers survive.
 */
export function patchCatalogEntry(source: string, id: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l.trim() === `- id: ${id}`);
  if (start === -1) throw new Error(`Catalog entry not found: ${id}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*- id: /.test(lines[i])) {
      end = i;
      break;
    }
  }
  for (let i = start; i < end; i++) {
    lines[i] = lines[i]
      .replace(/^(\s*)status: coming_soon\s*$/, "$1status: available")
      .replace(/^(\s*)encoding: none\s*$/, "$1encoding: control_map");
  }
  return lines.join("\n");
}

export function planIsoScaffold(id: string): IsoScaffoldPlan {
  const entry = findIsoCatalogEntry(id);
  if (!entry) {
    throw new Error(`ISO カタログに ${id} がありません。先に catalog.yaml へ追加してください。`);
  }
  if (entry.status === "available") {
    throw new Error(`${id} はすでに available です。`);
  }
  if (entry.kind === "guidance" || entry.kind === "control_set") {
    throw new Error(
      `${id} は ${entry.kind}。単独パックにせず、コアの guidance_refs か拡張元の Annex に載せてください。`
    );
  }
  const profile = entry.core_profile ?? "hls_full";
  const dir = getIsoStandardDir(id);
  const catalogPath = isoCatalogPath();

  return {
    id,
    dir,
    files: [
      { path: join(dir, "control-map.yaml"), content: renderControlMap(id, profile) },
      {
        path: join(dir, "00-このフォルダについて.md"),
        content: renderIndex(id, entry.title, entry.year, profile),
      },
    ],
    catalog_path: catalogPath,
    catalog_patch: patchCatalogEntry(readFileSync(catalogPath, "utf-8"), id),
  };
}

export function runIsoScaffold(id: string, opts: IsoScaffoldOptions = {}): void {
  const plan = planIsoScaffold(id);

  if (opts.json) {
    console.log(JSON.stringify({ ...plan, dry_run: Boolean(opts.dryRun) }, null, 2));
  } else {
    console.log(`# iso scaffold ${id}\n`);
    for (const f of plan.files) {
      console.log(`--- ${f.path}`);
      console.log(f.content);
    }
    console.log(`--- ${plan.catalog_path}: status → available · encoding → control_map`);
  }

  if (opts.dryRun) {
    if (!opts.json) console.log("\ndry-run。書き込むには --dry-run を外してください。");
    return;
  }

  mkdirSync(plan.dir, { recursive: true });
  for (const f of plan.files) {
    if (existsSync(f.path)) {
      throw new Error(`既に存在します: ${f.path}`);
    }
    writeFileSync(f.path, f.content, "utf-8");
  }
  writeFileSync(plan.catalog_path, plan.catalog_patch, "utf-8");
  if (!opts.json) {
    console.log(`\n✓ ${id} を available に昇格しました。領域統制を書いて orgos iso maps verify。`);
  }
}
