#!/usr/bin/env node
/**
 * Static catalog of the HTTP surface. Every route declaration in the BFF
 * sources is extracted with the byte range of its handler block, so the scorer
 * can check documentation coverage per route (R0-3) and look for guards inside
 * the route that claims them rather than anywhere in a 2000 line file (R0-4).
 *
 *   npm run ooo:routes -- --json
 *
 * Declarations the parser cannot see are declared in the source with
 * annotations, so a hard-to-parse route is still auditable:
 *
 *   // @ooo-route-prefix /chat/v1/org/budget,/api/v1/org/budget
 *   // @ooo-route-section-base /console/v1/tenants/:tenant
 *   // @ooo-route POST /chat/v1/org/budget/expense-claim/approve
 */
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { globFilesSync } from "../src/lib/glob-files.js";
import { ROOT_DIR } from "../src/lib/tenant.js";

/** Files that answer HTTP requests. Everything else is out of scope. */
const SOURCE_GLOBS = [
  "src/lib/steward-chat/*.ts",
  "src/lib/steward-chat/routes/*.ts",
  "src/lib/wire-console/routes/*.ts",
  "src/lib/protocol/community-*-api.ts",
];

export interface RouteRef {
  method: string;
  /** Declared with `@ooo-route`, so it shares a dispatcher with its siblings. */
  annotated?: boolean;
  path: string;
  source: string;
  /** Line of the declaration, 1-based. */
  line: number;
  /** Line where the handler block ends (exclusive), 1-based. */
  endLine: number;
}

const ABSOLUTE_FIRST =
  /pathname\s*===\s*"([^"]+)"\s*&&\s*method\s*===\s*"([A-Z]+)"/;
const METHOD_FIRST = /method\s*===\s*"([A-Z]+)"\s*&&\s*pathname\s*===\s*"([^"]+)"/;
const RELATIVE_FIRST = /\bpath\s*===\s*"([^"]+)"\s*&&\s*method\s*===\s*"([A-Z]+)"/;
const SECTION = /\bsection\s*===\s*"([^"]+)"/;
const PATH_REGEX = /pathname\.match\(\/\^(.+?)\$\/\)/;
const ANNOTATION = /@ooo-route\s+([A-Z]+)\s+(\S+)/;
const PREFIX_ANNOTATION = /@ooo-route-prefix\s+(\S+)/;
const SECTION_BASE_ANNOTATION = /@ooo-route-section-base\s+(\S+)/;
const METHOD_IN_BLOCK = /method\s*===\s*"([A-Z]+)"/;
/** `if (method !== "GET") { 405 }` — a block that admits exactly one method. */
const METHOD_GUARD_IN_BLOCK = /method\s*!==\s*"([A-Z]+)"/;
/** `if (pathname === "/x") {` — the method is asserted inside the block. */
const PATH_ONLY = /\bpathname\s*===\s*"([^"]+)"\s*\)/;
/** `if (pathname !== "/x") return false;` — a module that owns a single path. */
const PATH_GUARD = /\bpathname\s*!==\s*"([^"]+)"\s*\)\s*return\s+false/;

/** Join a mount prefix with a relative path, keeping "/" meaning the root. */
function joinPath(prefix: string, rest: string): string {
  if (rest === "/" || rest === "") return prefix;
  return `${prefix}${rest.startsWith("/") ? rest : `/${rest}`}`;
}

/**
 * Where a route's handler ends: the line before the next declaration in the
 * same file, or end of file. Coarse, but it keeps a guard found for route A
 * from being credited to route B further down the file.
 */
function withEnds(
  partial: Omit<RouteRef, "endLine">[],
  total: number,
  closesBlock: (line: number) => boolean = () => true,
): RouteRef[] {
  const sorted = [...partial].sort((a, b) => a.line - b.line);
  // Annotated routes describe paths a shared dispatcher answers, so they do not
  // truncate each other: each one runs to the next real declaration.
  const ranged = sorted.map((route, i) => {
    const next = sorted
      .slice(i + 1)
      .find(
        (candidate) =>
          candidate.line > route.line &&
          (!route.annotated || !candidate.annotated) &&
          closesBlock(candidate.line),
      );
    return { ...route, endLine: next?.line ?? total + 1 };
  });
  // A path often appears twice in a module: once in a one-line `canHandle`
  // predicate and once in the handler itself. The handler is the block that
  // carries the guards, so the widest block wins.
  const widest = new Map<string, RouteRef>();
  for (const route of ranged) {
    const key = `${route.method} ${route.path}`;
    const kept = widest.get(key);
    const span = route.endLine - route.line;
    if (!kept || span > kept.endLine - kept.line) widest.set(key, route);
  }
  return [...widest.values()].sort((a, b) => a.line - b.line);
}

/**
 * `if (a === x && m === "POST") ||` continued on the next line declares two
 * routes that share one handler. Such a line opens no block of its own, so its
 * range must run with the group rather than end at the next declaration.
 */
function opensBlock(line: string): boolean {
  return /\{\s*$/.test(line);
}

export function extractRoutes(source: string, text: string): RouteRef[] {
  const lines = text.split("\n");
  const declLines = new Set<number>();
  const prefixes = text.match(PREFIX_ANNOTATION)?.[1]?.split(",") ?? [];
  const sectionBase = text.match(SECTION_BASE_ANNOTATION)?.[1] ?? null;
  const found: Omit<RouteRef, "endLine">[] = [];

  lines.forEach((line, i) => {
    const lineNo = i + 1;

    const annotated = line.match(ANNOTATION);
    if (annotated) {
      found.push({
        method: annotated[1],
        path: annotated[2],
        source,
        line: lineNo,
        annotated: true,
      });
      return;
    }

    const absolute = line.match(ABSOLUTE_FIRST);
    if (absolute) {
      found.push({ method: absolute[2], path: absolute[1], source, line: lineNo });
      return;
    }

    const methodFirst = line.match(METHOD_FIRST);
    if (methodFirst) {
      found.push({ method: methodFirst[1], path: methodFirst[2], source, line: lineNo });
      return;
    }

    const rel = line.match(RELATIVE_FIRST);
    if (rel && prefixes.length) {
      for (const prefix of prefixes) {
        found.push({ method: rel[2], path: joinPath(prefix, rel[1]), source, line: lineNo });
      }
      return;
    }

    const pattern = line.match(PATH_REGEX);
    if (pattern) {
      // `/^\/chat\/v1\/commands\/([^/]+)\/run$/` reads as `/chat/v1/commands/:id/run`.
      const path = pattern[1].replace(/\\\//g, "/").replace(/\(\[\^\/\]\+\)/g, ":id");
      const block = lines.slice(i, i + 30).join("\n");
      const method = block.match(METHOD_IN_BLOCK)?.[1] ?? "ANY";
      found.push({ method, path, source, line: lineNo });
      return;
    }

    const guard = line.match(PATH_GUARD);
    if (guard) {
      // The guard hands the rest of the handler one path, and each method is
      // asserted further down. Reading only the first one hides the writes.
      const rest = lines.slice(i).join("\n");
      const methods = [...rest.matchAll(new RegExp(METHOD_IN_BLOCK, "g"))].map((m) => m[1]!);
      const distinct = [...new Set(methods)];
      if (distinct.length === 0) {
        distinct.push(rest.match(METHOD_GUARD_IN_BLOCK)?.[1] ?? "ANY");
      }
      for (const method of distinct) found.push({ method, path: guard[1]!, source, line: lineNo });
      return;
    }

    const pathOnly = line.match(PATH_ONLY);
    if (pathOnly) {
      const block = lines.slice(i, i + 30).join("\n");
      found.push({
        method:
          block.match(METHOD_IN_BLOCK)?.[1] ??
          block.match(METHOD_GUARD_IN_BLOCK)?.[1] ??
          "ANY",
        path: pathOnly[1],
        source,
        line: lineNo,
      });
      return;
    }

    const section = line.match(SECTION);
    if (section && sectionBase) {
      // The method is asserted inside the section block, not on the same line.
      const block = lines.slice(i, i + 30).join("\n");
      const method = block.match(METHOD_IN_BLOCK)?.[1] ?? "ANY";
      found.push({ method, path: joinPath(sectionBase, section[1]), source, line: lineNo });
    }
  });

  for (const route of found) declLines.add(route.line);
  return withEnds(found, lines.length, (line) =>
    declLines.has(line) ? opensBlock(lines[line - 1] ?? "") : true,
  );
}

/**
 * The same path can appear in two files: a one-line predicate that says "this
 * module owns it" and the handler that answers it. Guards live in the handler,
 * so the widest block wins across files as well as within one.
 */
function widestPerRoute(routes: RouteRef[]): RouteRef[] {
  const best = new Map<string, RouteRef>();
  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    const kept = best.get(key);
    if (!kept || route.endLine - route.line > kept.endLine - kept.line) best.set(key, route);
  }
  return [...best.values()];
}

export function routeCatalog(): RouteRef[] {
  const routes: RouteRef[] = [];
  for (const pattern of SOURCE_GLOBS) {
    for (const file of globFilesSync(pattern, { cwd: ROOT_DIR }).sort()) {
      const source = relative(ROOT_DIR, join(ROOT_DIR, file));
      routes.push(...extractRoutes(source, readFileSync(join(ROOT_DIR, file), "utf-8")));
    }
  }
  return widestPerRoute(routes);
}

/** Routes declared by the given source files, keyed for quick membership tests. */
export function routesForSources(sources: string[]): RouteRef[] {
  const wanted = new Set(sources);
  return routeCatalog().filter((route) => wanted.has(route.source));
}

/** The handler text of a route, used to look for guards inside it. */
export function routeBody(route: RouteRef): string {
  const lines = readFileSync(join(ROOT_DIR, route.source), "utf-8").split("\n");
  return lines.slice(route.line - 1, route.endLine - 1).join("\n");
}

/**
 * Everything before the first route declaration in the file. Some modules
 * authenticate once in the dispatcher and then branch on the path, so an
 * authorisation gate there genuinely covers the routes below it. Validation and
 * error containment are not read from here: those belong to the route.
 */
export function sourcePreamble(source: string): string {
  const lines = readFileSync(join(ROOT_DIR, source), "utf-8").split("\n");
  const first = extractRoutes(source, lines.join("\n"))[0]?.line ?? 1;
  return lines.slice(0, first - 1).join("\n");
}

function main(): void {
  const routes = routeCatalog();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(routes, null, 2));
    return;
  }
  const bySource = new Map<string, RouteRef[]>();
  for (const route of routes) {
    bySource.set(route.source, [...(bySource.get(route.source) ?? []), route]);
  }
  for (const [source, list] of [...bySource].sort()) {
    console.log(`\n${source} (${list.length})`);
    for (const route of list) console.log(`  ${route.method.padEnd(6)} ${route.path}`);
  }
  console.log(`\n合計 ${routes.length} 経路 / ${bySource.size} ファイル`);
}

if (process.argv[1]?.endsWith("ooo-routes.ts")) main();
