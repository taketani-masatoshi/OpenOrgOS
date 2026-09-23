/**
 * Scheduling architecture ratchet — R1–R5.
 * New violations fail; removing an allowlisted item without code cleanup also fails.
 * Goal: empty allowlists (quality ceiling).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src");
const CORRESPONDENCE_DIR = join(ROOT, "lib", "correspondence");
const SCHEDULING_DIR = join(ROOT, "lib", "scheduling-coordination");

/** Modules that must stay pure (no store/fs/cross-domain I/O, no new Date()). */
const CORE_MODULES = [
  "next-action.ts",
  "reply-parse.ts",
  "slots.ts",
  "ceo-choice.ts",
  "chat-parse.ts",
  "venue-gate.ts",
  "venue-clarify.ts",
  "meal-cost.ts",
  "ceo-gates.ts",
  "draft-tag.ts",
  "transitions.ts",
  "reply-plan.ts",
] as const;

/** Entry files that must call registerDomainAdapters() after invert-deps. */
const ENTRY_FILES = [
  "src/cli.ts",
  "src/lib/steward-chat/server.ts",
  "src/lib/operator-console/combined-server.ts",
  "src/lib/wire-console/server.ts",
] as const;

const STATIC_FROM =
  /(?:from\s+|import\()\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /(?:await\s+)?import\s*\(\s*["']([^"']+)["']\s*\)/g;
const REEXPORT_ONLY =
  /^\s*export\s+(type\s+)?\{[^}]*\}\s+from\s+["'][^"']+["']\s*;?\s*$/;
const REEXPORT_STAR = /^\s*export\s+\*\s+from\s+["'][^"']+["']\s*;?\s*$/;
const NEW_DATE = /\bnew\s+Date\s*\(\s*\)/g;

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      out.push(...walkTsFiles(full));
    } else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function rel(path: string): string {
  return relative(process.cwd(), path).replace(/\\/g, "/");
}

function collectImportSpecifiers(source: string): {
  staticImports: string[];
  dynamicImports: string[];
} {
  const staticImports: string[] = [];
  const dynamicImports: string[] = [];
  for (const m of source.matchAll(STATIC_FROM)) {
    staticImports.push(m[1]!);
  }
  for (const m of source.matchAll(DYNAMIC_IMPORT)) {
    dynamicImports.push(m[1]!);
  }
  return { staticImports, dynamicImports };
}

function hasReexportStatements(source: string): string[] {
  const hits: string[] = [];
  // Single-line and multi-line: export { ... } from "..."
  const multi = /export\s+(?:type\s+)?\{[\s\S]*?\}\s+from\s+["'][^"']+["']/g;
  const star = /export\s+\*\s+from\s+["'][^"']+["']/g;
  for (const m of source.matchAll(multi)) hits.push(m[0]!.replace(/\s+/g, " ").slice(0, 80));
  for (const m of source.matchAll(star)) hits.push(m[0]!);
  return hits;
}

function isReexportOnlyModule(source: string): boolean {
  const withoutBlock = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutExports = withoutBlock
    .replace(/export\s+(?:type\s+)?\{[\s\S]*?\}\s+from\s+["'][^"']+["']\s*;?/g, "")
    .replace(/export\s+\*\s+from\s+["'][^"']+["']\s*;?/g, "")
    .replace(/export\s+type\s+\{[\s\S]*?\}\s+from\s+["'][^"']+["']\s*;?/g, "");
  const leftover = withoutExports
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("//"));
  return leftover.length === 0 && hasReexportStatements(source).length > 0;
}

/** Current known violations — shrink toward empty. Sorted for stable diffs. */
const ALLOW_R1_CORRESPONDENCE_TO_SCHEDULING = [
  "src/lib/correspondence/case-status.ts",
  "src/lib/correspondence/ceo-inline-question.ts",
  "src/lib/correspondence/draft.ts",
  "src/lib/correspondence/mail-handoff.ts",
  "src/lib/correspondence/mail-receive-poller.ts",
  "src/lib/correspondence/send-gate.ts",
  "src/lib/correspondence/style-lint.ts",
].sort();

const ALLOW_R2_DYNAMIC_IMPORTS = [
  "src/lib/correspondence/ceo-inline-question.ts",
  "src/lib/correspondence/send-gate.ts",
  "src/lib/scheduling-coordination/delegated-send.ts",
  "src/lib/scheduling-coordination/process-mail.ts",
].sort();

const ALLOW_R3_REEXPORT_FACADES = [
  "src/lib/scheduling-coordination/draft-text.ts",
  "src/lib/scheduling-coordination/lifecycle.ts",
  "src/lib/scheduling-coordination/process-mail.ts",
].sort();

const ALLOW_R4_CORE_IO = [
  "src/lib/scheduling-coordination/chat-parse.ts:../secretary/",
  "src/lib/scheduling-coordination/reply-parse.ts:new Date()",
  "src/lib/scheduling-coordination/slots.ts:./store",
  "src/lib/scheduling-coordination/venue-gate.ts:../venue-booking/",
].sort();

const ALLOW_R5_MISSING_REGISTER = [
  "src/cli.ts",
  "src/lib/operator-console/combined-server.ts",
  "src/lib/steward-chat/server.ts",
  "src/lib/wire-console/server.ts",
  "tests/setup-tenant.ts",
].sort();

function expectExactAllowlist(actual: string[], allowed: string[], label: string): void {
  const a = [...new Set(actual)].sort();
  const b = [...allowed].sort();
  const unexpected = a.filter((x) => !b.includes(x));
  const stale = b.filter((x) => !a.includes(x));
  expect(unexpected, `${label}: new violations (remove by fixing code):\n${unexpected.join("\n")}`).toEqual(
    []
  );
  expect(
    stale,
    `${label}: stale allowlist entries (remove from allowlist):\n${stale.join("\n")}`
  ).toEqual([]);
}

describe("scheduling architecture ratchet", () => {
  it("R1: correspondence must not import scheduling-coordination (allowlisted until invert)", () => {
    const hits: string[] = [];
    for (const file of walkTsFiles(CORRESPONDENCE_DIR)) {
      const source = readFileSync(file, "utf-8");
      const { staticImports, dynamicImports } = collectImportSpecifiers(source);
      const all = [...staticImports, ...dynamicImports];
      if (all.some((spec) => spec.includes("scheduling-coordination"))) {
        hits.push(rel(file));
      }
    }
    expectExactAllowlist(hits, ALLOW_R1_CORRESPONDENCE_TO_SCHEDULING, "R1");
  });

  it("R2: no dynamic import in scheduling or correspondence→scheduling (allowlisted until invert)", () => {
    const hits: string[] = [];
    for (const file of [...walkTsFiles(SCHEDULING_DIR), ...walkTsFiles(CORRESPONDENCE_DIR)]) {
      const source = readFileSync(file, "utf-8");
      for (const m of source.matchAll(DYNAMIC_IMPORT)) {
        const spec = m[1]!;
        const pathRel = rel(file);
        if (pathRel.includes("scheduling-coordination/")) {
          hits.push(pathRel);
          break;
        }
        if (pathRel.includes("correspondence/") && spec.includes("scheduling-coordination")) {
          hits.push(pathRel);
          break;
        }
      }
    }
    expectExactAllowlist(hits, ALLOW_R2_DYNAMIC_IMPORTS, "R2");
  });

  it("R3: no re-export-only facades in scheduling-coordination (allowlisted until remove-facades)", () => {
    const hits: string[] = [];
    for (const file of walkTsFiles(SCHEDULING_DIR)) {
      const source = readFileSync(file, "utf-8");
      const pathRel = rel(file);
      if (isReexportOnlyModule(source)) {
        hits.push(pathRel);
        continue;
      }
      // Known partial facades that re-export siblings
      if (
        pathRel.endsWith("lifecycle.ts") ||
        pathRel.endsWith("process-mail.ts") ||
        pathRel.endsWith("draft-text.ts")
      ) {
        if (hasReexportStatements(source).length > 0) hits.push(pathRel);
      }
    }
    expectExactAllowlist(hits, ALLOW_R3_REEXPORT_FACADES, "R3");
  });

  it("R4: core modules must not import store/fs/cross-domain I/O or use new Date() (allowlisted until pure-core)", () => {
    const hits: string[] = [];
    for (const name of CORE_MODULES) {
      const file = join(SCHEDULING_DIR, name);
      if (!statSync(file, { throwIfNoEntry: false })?.isFile()) continue;
      const source = readFileSync(file, "utf-8");
      const pathRel = rel(file);
      const { staticImports } = collectImportSpecifiers(source);
      for (const spec of staticImports) {
        if (
          spec === "./store.js" ||
          spec === "./store" ||
          spec.startsWith("./store?")
        ) {
          hits.push(`${pathRel}:./store`);
        }
        if (spec.startsWith("node:fs") || spec === "fs") {
          hits.push(`${pathRel}:node:fs`);
        }
        if (spec.includes("../correspondence/")) {
          hits.push(`${pathRel}:../correspondence/`);
        }
        if (spec.includes("../org/")) {
          hits.push(`${pathRel}:../org/`);
        }
        if (spec.includes("../venue-booking/")) {
          hits.push(`${pathRel}:../venue-booking/`);
        }
        if (spec.includes("../secretary/")) {
          hits.push(`${pathRel}:../secretary/`);
        }
      }
      if (NEW_DATE.test(source)) {
        hits.push(`${pathRel}:new Date()`);
      }
      NEW_DATE.lastIndex = 0;
    }
    expectExactAllowlist(hits, ALLOW_R4_CORE_IO, "R4");
  });

  it("R5: entrypoints must call registerDomainAdapters() (allowlisted until invert-deps)", () => {
    const hits: string[] = [];
    for (const entry of ENTRY_FILES) {
      const full = join(process.cwd(), entry);
      const source = readFileSync(full, "utf-8");
      if (!source.includes("registerDomainAdapters")) {
        hits.push(entry);
      }
    }
    const setupSrc = readFileSync(join(process.cwd(), "tests", "setup-tenant.ts"), "utf-8");
    if (!setupSrc.includes("registerDomainAdapters")) {
      hits.push("tests/setup-tenant.ts");
    }
    expectExactAllowlist(hits, ALLOW_R5_MISSING_REGISTER, "R5");
  });
});
