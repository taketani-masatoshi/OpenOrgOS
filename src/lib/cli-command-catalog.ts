/**
 * Machine-readable OrgOS CLI command catalog for interop and facade verification.
 */

import type { Command } from "commander";

export interface CliCommandCatalogEntry {
  path: string[];
  description: string;
  canonical?: boolean;
  deprecated?: boolean;
  facade?: "wire" | "internal" | "platform";
}

const LEGACY_ROOTS = new Set(["protocol", "wire-gateway"]);
const CANONICAL_FACADES = new Set(["wire"]);

export function buildCliCommandCatalog(program: Command): CliCommandCatalogEntry[] {
  const entries: CliCommandCatalogEntry[] = [];

  function walk(command: Command, path: string[]): void {
    const segment = command.name();
    const currentPath = path.length ? [...path, segment] : [segment];
    const description = command.description().trim();
    if (description) {
      const root = currentPath[0];
      entries.push({
        path: currentPath,
        description,
        canonical: CANONICAL_FACADES.has(root),
        deprecated: LEGACY_ROOTS.has(root),
        facade:
          root === "wire"
            ? "wire"
            : root === "webhook"
              ? "internal"
              : root === "platform"
                ? "platform"
                : undefined,
      });
    }
    for (const child of command.commands) {
      walk(child, currentPath);
    }
  }

  for (const topLevel of program.commands) {
    walk(topLevel, []);
  }

  return entries.sort((a, b) => a.path.join(" ").localeCompare(b.path.join(" ")));
}

export function summarizeCliCommandCatalog(entries: CliCommandCatalogEntry[]): {
  total: number;
  wireFacadeCommands: number;
  legacyRoots: string[];
  canonicalFacades: string[];
} {
  const roots = new Set(entries.map((entry) => entry.path[0]));
  return {
    total: entries.length,
    wireFacadeCommands: entries.filter((entry) => entry.path[0] === "wire").length,
    legacyRoots: [...roots].filter((root) => LEGACY_ROOTS.has(root)).sort(),
    canonicalFacades: [...roots].filter((root) => CANONICAL_FACADES.has(root)).sort(),
  };
}

export function validateCliCommandCatalog(entries: CliCommandCatalogEntry[]): string[] {
  const issues: string[] = [];
  const summary = summarizeCliCommandCatalog(entries);

  if (!summary.canonicalFacades.includes("wire")) {
    issues.push("missing canonical wire facade root");
  }
  if (summary.wireFacadeCommands < 5) {
    issues.push(`wire facade too small (${summary.wireFacadeCommands} commands)`);
  }

  const requiredWirePaths = [
    ["wire", "gateway", "serve"],
    ["wire", "peer", "register"],
    ["wire", "delivery", "send"],
    ["wire", "witness", "verify"],
    ["wire", "score"],
  ];
  for (const required of requiredWirePaths) {
    const found = entries.some(
      (entry) =>
        entry.path.length === required.length &&
        entry.path.every((segment, index) => segment === required[index])
    );
    if (!found) {
      issues.push(`missing wire path: ${required.join(" ")}`);
    }
  }

  const webhook = entries.find((entry) => entry.path.join(" ") === "webhook");
  if (!webhook?.description.match(/internal/i)) {
    issues.push("webhook root must describe internal automation");
  }

  return issues;
}
