#!/usr/bin/env node
/**
 * OOO capability scoring. Reads docs/org-os/ooo-capability-items.yaml and scores
 * each item against the repository as it actually is: which test files exist,
 * whether a BFF route is exercised over HTTP, and whether the E2E spec is wired
 * into a playwright config. Only `spec` and `impl` are human judgement.
 *
 *   npm run ooo:score            human table
 *   npm run ooo:score -- --json  machine output (canvas / CI)
 *   npm run ooo:score -- --gate 90 --id OOO-10
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { ROOT_DIR } from "../src/lib/tenant.js";

interface HttpEvidence {
  tests: string[];
  route: string;
}

interface ItemDef {
  id: string;
  domain: string;
  act: string;
  spec: number;
  impl: number;
  unit?: string[];
  http?: HttpEvidence | null;
  e2e?: string[];
}

export interface ScoredItem extends ItemDef {
  unit_points: number;
  unit_grade: "厚" | "薄" | "無";
  http_points: number;
  e2e_points: number;
  e2e_state: "緑" | "登録のみ" | "未登録" | "無";
  verify_points: number;
  test_points: number;
  total: number;
  notes: string[];
}

const ITEMS_PATH = join(ROOT_DIR, "docs/org-os/ooo-capability-items.yaml");
const E2E_RESULT_PATH = join(ROOT_DIR, "tests/.ooo-e2e-green.json");

/** Spec files listed in any playwright.*.config.ts testMatch. */
function registeredE2eSpecs(): Set<string> {
  const specs = new Set<string>();
  for (const file of readdirSync(ROOT_DIR)) {
    if (!file.startsWith("playwright") || !file.endsWith(".config.ts")) continue;
    const text = readFileSync(join(ROOT_DIR, file), "utf-8");
    const match = text.match(/testMatch:\s*(\[[\s\S]*?\]|"[^"]+")/);
    if (!match) continue;
    for (const name of match[1]!.match(/[\w.\-*]+\.spec\.ts/g) ?? []) {
      specs.add(name);
    }
  }
  return specs;
}

/**
 * Specs proven green by the last `npm run ooo:e2e` run. Absent file means we
 * have registration but no evidence the spec passes — worth 3, not 12.
 */
function greenE2eSpecs(): Set<string> {
  if (!existsSync(E2E_RESULT_PATH)) return new Set();
  try {
    const raw = JSON.parse(readFileSync(E2E_RESULT_PATH, "utf-8")) as { green?: string[] };
    return new Set(raw.green ?? []);
  } catch {
    return new Set();
  }
}

function unitScore(paths: string[]): { points: number; grade: "厚" | "薄" | "無"; missing: string[] } {
  const missing = paths.filter((p) => !existsSync(join(ROOT_DIR, p)));
  const present = paths.length - missing.length;
  if (present >= 2) return { points: 10, grade: "厚", missing };
  if (present === 1) return { points: 5, grade: "薄", missing };
  return { points: 0, grade: "無", missing };
}

function httpScore(http: HttpEvidence | null | undefined): { points: number; note?: string } {
  if (!http) return { points: 0 };
  const files = http.tests.filter((p) => existsSync(join(ROOT_DIR, p)));
  if (files.length === 0) return { points: 0, note: `http テスト不在: ${http.tests.join(", ")}` };
  const hits = files.filter((p) => readFileSync(join(ROOT_DIR, p), "utf-8").includes(http.route));
  if (hits.length === 0) {
    return { points: 0, note: `${files[0]} が ${http.route} を叩いていない` };
  }
  return { points: 8 };
}

function scoreItem(
  item: ItemDef,
  registered: Set<string>,
  green: Set<string>,
): ScoredItem {
  const notes: string[] = [];
  const unit = unitScore(item.unit ?? []);
  if (unit.missing.length) notes.push(`unit 不在: ${unit.missing.join(", ")}`);

  const http = httpScore(item.http);
  if (http.note) notes.push(http.note);
  if (!item.http) notes.push("BFF を HTTP で叩くテストが無い");

  const specs = item.e2e ?? [];
  let e2ePoints = 0;
  let e2eState: ScoredItem["e2e_state"] = "無";
  if (specs.length === 0) {
    notes.push("E2E が無い");
  } else {
    const names = specs.map((p) => p.split("/").pop()!);
    if (names.some((n) => green.has(n))) {
      e2ePoints = 12;
      e2eState = "緑";
    } else if (names.some((n) => registered.has(n))) {
      e2ePoints = 3;
      e2eState = "登録のみ";
      notes.push("E2E は config に載っているが緑の記録が無い");
    } else {
      e2ePoints = 1;
      e2eState = "未登録";
      notes.push(`E2E がどの playwright config にも載っていない: ${names.join(", ")}`);
    }
  }

  // Verified means: reproducible via `npm run ooo:e2e`, not a one-off manual run.
  const verifyPoints = e2eState === "緑" ? 20 : e2eState === "登録のみ" ? 8 : 0;
  const testPoints = unit.points + http.points + e2ePoints;
  return {
    ...item,
    unit_points: unit.points,
    unit_grade: unit.grade,
    http_points: http.points,
    e2e_points: e2ePoints,
    e2e_state: e2eState,
    verify_points: verifyPoints,
    test_points: testPoints,
    total: item.spec + item.impl + testPoints + verifyPoints,
    notes,
  };
}

export function scoreAll(): ScoredItem[] {
  const raw = YAML.parse(readFileSync(ITEMS_PATH, "utf-8")) as { items: ItemDef[] };
  const registered = registeredE2eSpecs();
  const green = greenE2eSpecs();
  return raw.items.map((item) => scoreItem(item, registered, green));
}

function main(): void {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const idArg = args[args.indexOf("--id") + 1];
  const gateArg = args.includes("--gate") ? Number(args[args.indexOf("--gate") + 1]) : undefined;

  let rows = scoreAll();
  if (args.includes("--id") && idArg) rows = rows.filter((r) => r.id === idArg);

  if (json) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
  } else {
    for (const r of rows) {
      console.log(
        `${r.id} ${String(r.total).padStart(3)} ` +
          `[仕様${r.spec} 実装${r.impl} テスト${r.test_points}(単体${r.unit_grade}/HTTP${r.http_points ? "有" : "無"}/E2E${r.e2e_state}) 実機${r.verify_points}] ${r.act}`,
      );
      for (const note of r.notes) console.log(`      · ${note}`);
    }
    const avg = rows.reduce((s, r) => s + r.total, 0) / (rows.length || 1);
    const ok = rows.filter((r) => r.total >= 90).length;
    console.log(`\n${rows.length} 件 · 平均 ${avg.toFixed(1)} · 90点以上 ${ok} 件`);
  }

  if (gateArg !== undefined) {
    const below = rows.filter((r) => r.total < gateArg);
    if (below.length) {
      console.error(`\n${gateArg} 点未満: ${below.map((r) => `${r.id}(${r.total})`).join(", ")}`);
      process.exit(1);
    }
  }
}

if (process.argv[1]?.endsWith("ooo-score.ts")) main();
