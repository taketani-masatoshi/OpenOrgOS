#!/usr/bin/env node
/**
 * OOO capability scoring. Reads docs/org-os/ooo-capability-items.yaml and scores
 * each item against the repository as it actually is. No axis is a declared
 * number: every point traces to a file that exists and a string that appears in
 * it.
 *
 *   仕様20  文書の経路表と実装の経路カタログが双方向で一致している
 *   実装30  その項目の経路ブロック内に権限ガード・入力検証・例外封じ込めがある
 *   テスト30 単体10 + HTTP8 + E2E12（すべて緑が条件・存在だけなら0）
 *   実機20  該当 E2E が `npm run ooo:e2e` で緑
 *
 *   npm run ooo:score            human table
 *   npm run ooo:score -- --json  machine output (canvas / CI)
 *   npm run ooo:score -- --gate 99 --id OOO-10
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { ROOT_DIR } from "../src/lib/tenant.js";
import { routeBody, routeCatalog, sourcePreamble, type RouteRef } from "./ooo-routes.js";

interface HttpEvidence {
  tests: string[];
  route: string;
}

/**
 * Documentation evidence. `docs` must all exist; `mentions` are the strings the
 * documentation has to contain — by convention the route or CLI, the permission
 * it demands, and what it refuses.
 */
interface SpecEvidence {
  docs: string[];
  mentions: string[];
}

/**
 * Implementation evidence. `sources` are the files that actually carry the
 * behaviour; the guards below are detected in them rather than declared.
 * `read_only` marks a surface that must never mutate, which changes what
 * counts as a passing guard.
 */
interface ImplEvidence {
  sources: string[];
  /**
   * The routes this act claims, as `METHOD /path`. Most sources are shared
   * dispatchers — `chat-api.ts` alone answers 55 routes — so scoring a narrow
   * act against every route in its file measures the file, not the act. When
   * absent, every route in `sources` is claimed.
   */
  routes?: string[];
  read_only?: boolean;
}

interface ItemDef {
  id: string;
  domain: string;
  act: string;
  spec?: SpecEvidence | null;
  impl?: ImplEvidence | null;
  unit?: string[];
  http?: HttpEvidence | null;
  e2e?: string[];
}

export interface ScoredItem extends Omit<ItemDef, "spec" | "impl"> {
  spec: number;
  impl: number;
  spec_checks: string[];
  impl_checks: string[];
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
const UNIT_RESULT_PATH = join(ROOT_DIR, "tests/.ooo-unit-green.json");

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

function readIfPresent(path: string): string | null {
  const full = join(ROOT_DIR, path);
  return existsSync(full) ? readFileSync(full, "utf-8") : null;
}

/** `POST /chat/v1/x/:name` inside a backtick, as written in the surface docs. */
const DOC_ROUTE = /`(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s`]+)`/g;

/** Parameter names differ between docs and code; only the shape matters. */
function normalizePath(path: string): string {
  return path.replace(/:[^/]+/g, ":id").replace(/\/$/, "");
}

function routeKey(method: string, path: string): string {
  return `${method} ${normalizePath(path)}`;
}

/**
 * The routes an act is scored against: the ones it declares, or every route in
 * its sources when it declares none. A declared route that no source answers is
 * dropped here and reported as missing by the spec axis.
 */
function claimedRoutes(
  impl: ImplEvidence | null | undefined,
  catalog: RouteRef[],
): RouteRef[] {
  const sources = new Set(impl?.sources ?? []);
  const own = catalog.filter((route) => sources.has(route.source));
  const declared = impl?.routes;
  if (!Array.isArray(declared) || declared.length === 0) return own;
  const wanted = new Set(declared.map((r) => routeKey(...(r.split(/\s+/) as [string, string]))));
  return own.filter((route) =>
    wanted.has(routeKey(route.method === "ANY" ? "POST" : route.method, route.path)),
  );
}

/** Every route mentioned in the given documents. */
function documentedRoutes(docs: string[]): Set<string> {
  const found = new Set<string>();
  for (const doc of docs) {
    const text = readIfPresent(doc) ?? "";
    for (const match of text.matchAll(DOC_ROUTE)) {
      found.add(routeKey(match[1], match[2]));
    }
  }
  return found;
}

/**
 * 仕様 20 = 経路網羅。文書の経路表と実装の経路カタログを双方向で突合する。
 *
 *   10 点 — 実装している経路が文書に載っている割合
 *   10 点 — 文書が載せた経路が実装に在る割合（幻の経路を書けば落ちる）
 *
 * 単語を並べただけの文書は経路表が空になり、両方 0 になる。
 */
function specScore(
  spec: SpecEvidence | null | undefined,
  impl: ImplEvidence | null | undefined,
  catalog: RouteRef[],
): { points: number; checks: string[]; notes: string[] } {
  const notes: string[] = [];
  if (!spec || typeof spec !== "object" || !Array.isArray(spec.docs) || spec.docs.length === 0) {
    return { points: 0, checks: [], notes: ["仕様文書が指定されていない"] };
  }
  const missing = spec.docs.filter((p) => !existsSync(join(ROOT_DIR, p)));
  if (missing.length) {
    return { points: 0, checks: [], notes: [`仕様文書が不在: ${missing.join(", ")}`] };
  }

  const documented = documentedRoutes(spec.docs);
  if (documented.size === 0) {
    return { points: 0, checks: [], notes: ["仕様文書に経路表が無い"] };
  }

  const own = claimedRoutes(impl, catalog);
  const everything = new Set(catalog.map((route) => routeKey(route.method, route.path)));
  // `ANY` in the catalog means the method is decided inside the block.
  const implemented = new Set(
    own.map((route) => routeKey(route.method === "ANY" ? "POST" : route.method, route.path)),
  );
  const anyPaths = new Set(own.map((route) => normalizePath(route.path)));

  const checks: string[] = [];
  let points = 0;

  // A declared route that no source answers is a claim about a surface that is
  // not there; it must cost the same as documenting a phantom.
  const unresolved = (impl?.routes ?? []).filter(
    (r) => !implemented.has(routeKey(...(r.split(/\s+/) as [string, string]))),
  );
  if (unresolved.length) {
    notes.push(`宣言したが実装に見つからない経路: ${unresolved.slice(0, 5).join(" / ")}`);
  }

  if (implemented.size === 0) {
    notes.push("実装ソースから経路を抽出できない（採点対象の面が特定できない）");
  } else {
    const covered = [...implemented].filter(
      (key) => documented.has(key) || documented.has(key.replace(/^POST /, "GET ")),
    );
    const uncovered = [...implemented].filter((key) => !covered.includes(key));
    points += Math.round((covered.length / implemented.size) * 10);
    checks.push(`経路網羅 ${covered.length}/${implemented.size}`);
    if (uncovered.length) {
      notes.push(`文書に無い実装経路: ${uncovered.slice(0, 5).join(" / ")}`);
    }
  }

  // Paths the catalog found but whose method is decided inside the block. A
  // documented method on such a path cannot be called phantom.
  const unresolvedPaths = new Set(
    catalog.filter((route) => route.method === "ANY").map((route) => normalizePath(route.path)),
  );
  const phantom = [...documented].filter((key) => {
    if (everything.has(key)) return false;
    const path = key.split(" ")[1];
    return !anyPaths.has(path) && !unresolvedPaths.has(path);
  });
  points += Math.round(((documented.size - phantom.length) / documented.size) * 10);
  checks.push(`実在 ${documented.size - phantom.length}/${documented.size}`);
  if (phantom.length) {
    notes.push(`文書にあって実装に無い経路: ${phantom.slice(0, 5).join(" / ")}`);
  }

  return { points, checks, notes };
}

/**
 * Authorisation gates recognised across the BFF. Most surfaces sit behind a
 * `require*Permission` helper; the login entrance itself has no caller to
 * check yet, so its gate is the login-email policy.
 */
export const GUARD_AUTH =
  /require\w*Permission|require(Ceo|PlatformOperator|SalesPanel|Approver)|isOooLoginEmailAllowed|assert\w+Policy|(getChatSessionUser|sessionUser|requireWireSession)\([\s\S]{0,240}?\b401\b/;
/**
 * Structured refusal of a bad request rather than a throw into the void. Two
 * shapes exist in the tree: `json(res, 422, ...)` in the route modules and
 * `json(422, ...)` where the response is already closed over.
 */
export const GUARD_VALIDATION =
  /json\(\s*(res\s*,\s*)?(400|422|405)\s*,|(InvalidJsonError|ZodError)[\s\S]{0,120}?\b(400|422)\b/;
/** Errors contained and turned into a response, with or without a binding. */
export const GUARD_CONTAINMENT = /catch\s*[({]/;

/**
 * 実装 30 = ソース実在（6）+ 権限ガード（6）+ 入力検証（6）+ 例外封じ込め（6）
 * + HTTP テストが拒否を主張している（6）。
 *
 * 読み取り専用の面（`read_only: true`）は、書き込みが 405 で閉じていることを
 * 入力検証の代わりに数える。
 */
function implScore(
  impl: ImplEvidence | null | undefined,
  http: HttpEvidence | null | undefined,
  catalog: RouteRef[],
): { points: number; checks: string[]; notes: string[] } {
  const notes: string[] = [];
  if (
    !impl ||
    typeof impl !== "object" ||
    !Array.isArray(impl.sources) ||
    impl.sources.length === 0
  ) {
    return { points: 0, checks: [], notes: ["実装ソースが指定されていない"] };
  }
  const missing = impl.sources.filter((p) => !existsSync(join(ROOT_DIR, p)));
  if (missing.length) {
    return { points: 0, checks: [], notes: [`実装ソースが不在: ${missing.join(", ")}`] };
  }

  const own = claimedRoutes(impl, catalog);
  const checks = ["sources"];
  let points = 6;

  if (own.length === 0) {
    notes.push("実装ソースから経路を抽出できないため経路単位のガードを見られない");
    return { points, checks, notes };
  }

  // Guards must sit inside the route that needs them, not merely somewhere in
  // the same 2000 line module.
  const preambles = new Map(impl.sources.map((s) => [s, sourcePreamble(s)]));
  const bodies = own.map((route) => ({
    route,
    body: routeBody(route),
    gated: `${preambles.get(route.source) ?? ""}\n${routeBody(route)}`,
  }));
  const readOnly = impl.read_only === true;
  const mutating = bodies.filter(
    ({ route }) => route.method !== "GET" && route.method !== "ANY",
  );
  // A route that never reads a request body has no input to validate; demanding
  // a 422 from `POST /auth/logout` would only teach us to write dead branches.
  const withBody = mutating.filter(({ body }) => /readBody|req\.on\("data"|JSON\.parse/.test(body));

  const shortfall = (
    label: string,
    pattern: RegExp,
    scope: typeof bodies,
    field: "body" | "gated" = "body",
  ): void => {
    // Nothing in scope means the guard has nothing to protect — a read-only
    // surface has no body to validate — so the requirement is met vacuously.
    if (scope.length === 0) {
      checks.push(`${label}(該当なし)`);
      points += 6;
      return;
    }
    const bad = scope.filter((entry) => !pattern.test(entry[field]));
    if (bad.length === 0) {
      checks.push(label);
      points += 6;
      return;
    }
    notes.push(
      `${label} の無い経路 ${bad.length}/${scope.length}: ${bad
        .slice(0, 3)
        .map(({ route }) => `${route.method} ${route.path}`)
        .join(" / ")}`,
    );
  };

  // A route may be public by design — the login entrance has no caller to
  // authorise yet. That has to be declared in the source next to the route, so
  // the exemption is reviewed in the same diff as the code it excuses.
  const gated = bodies.filter(({ body }) => !/@ooo-route-public/.test(body));
  shortfall("auth", GUARD_AUTH, gated, "gated");
  // A read-only surface has nothing to validate; it must refuse writes instead.
  shortfall("validation", GUARD_VALIDATION, readOnly ? bodies : withBody);
  shortfall("containment", GUARD_CONTAINMENT, readOnly ? bodies : mutating);

  // A refusal that nothing asserts is a refusal that can silently disappear.
  const httpText = (http?.tests ?? []).map((p) => readIfPresent(p) ?? "").join("\n");
  const assertsRefusal =
    /(401|403|404|405|422)/.test(httpText) && /expect\(/.test(httpText);
  if (assertsRefusal) {
    checks.push("refusal-tested");
    points += 6;
  } else {
    notes.push("HTTP テストが拒否を主張していない");
  }

  return { points, checks, notes };
}

/**
 * Vitest files proven green by the last `npm run ooo:unit`. Absent record means
 * we have a file but no evidence it passes, which is worth nothing.
 */
function greenUnitFiles(): Set<string> {
  if (!existsSync(UNIT_RESULT_PATH)) return new Set();
  try {
    const raw = JSON.parse(readFileSync(UNIT_RESULT_PATH, "utf-8")) as { green?: string[] };
    return new Set(raw.green ?? []);
  } catch {
    return new Set();
  }
}

/** A test file only counts when it exists AND passed in the recorded run. */
function unitScore(
  paths: string[],
  green: Set<string>,
): { points: number; grade: "厚" | "薄" | "無"; notes: string[] } {
  const notes: string[] = [];
  const missing = paths.filter((p) => !existsSync(join(ROOT_DIR, p)));
  if (missing.length) notes.push(`unit 不在: ${missing.join(", ")}`);
  const present = paths.filter((p) => !missing.includes(p));
  const red = present.filter((p) => !green.has(p));
  if (red.length) notes.push(`unit が緑の記録に無い: ${red.join(", ")}`);

  const proven = present.length - red.length;
  if (proven >= 2) return { points: 10, grade: "厚", notes };
  if (proven === 1) return { points: 5, grade: "薄", notes };
  return { points: 0, grade: "無", notes };
}

function httpScore(
  http: HttpEvidence | null | undefined,
  green: Set<string>,
): { points: number; note?: string } {
  if (!http) return { points: 0 };
  const files = http.tests.filter((p) => existsSync(join(ROOT_DIR, p)));
  if (files.length === 0) return { points: 0, note: `http テスト不在: ${http.tests.join(", ")}` };
  const hits = files.filter((p) => readFileSync(join(ROOT_DIR, p), "utf-8").includes(http.route));
  if (hits.length === 0) {
    return { points: 0, note: `${files[0]} が ${http.route} を叩いていない` };
  }
  const proven = hits.filter((p) => green.has(p));
  if (proven.length === 0) {
    return { points: 0, note: `http テストが緑の記録に無い: ${hits.join(", ")}` };
  }
  return { points: 8 };
}

function scoreItem(
  item: ItemDef,
  registered: Set<string>,
  green: Set<string>,
  unitGreen: Set<string>,
  catalog: RouteRef[],
): ScoredItem {
  const notes: string[] = [];
  const spec = specScore(item.spec, item.impl, catalog);
  notes.push(...spec.notes);
  const impl = implScore(item.impl, item.http, catalog);
  notes.push(...impl.notes);

  const unit = unitScore(item.unit ?? [], unitGreen);
  notes.push(...unit.notes);

  const http = httpScore(item.http, unitGreen);
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
    spec: spec.points,
    impl: impl.points,
    spec_checks: spec.checks,
    impl_checks: impl.checks,
    unit_points: unit.points,
    unit_grade: unit.grade,
    http_points: http.points,
    e2e_points: e2ePoints,
    e2e_state: e2eState,
    verify_points: verifyPoints,
    test_points: testPoints,
    total: spec.points + impl.points + testPoints + verifyPoints,
    notes,
  };
}

export function scoreAll(): ScoredItem[] {
  const raw = YAML.parse(readFileSync(ITEMS_PATH, "utf-8")) as { items: ItemDef[] };
  const registered = registeredE2eSpecs();
  const green = greenE2eSpecs();
  const unitGreen = greenUnitFiles();
  const catalog = routeCatalog();
  return raw.items.map((item) => scoreItem(item, registered, green, unitGreen, catalog));
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
    const gate = gateArg ?? 99;
    const ok = rows.filter((r) => r.total >= gate).length;
    console.log(`\n${rows.length} 件 · 平均 ${avg.toFixed(1)} · ${gate}点以上 ${ok} 件`);
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
