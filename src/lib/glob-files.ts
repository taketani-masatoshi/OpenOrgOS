import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Minimal glob over a directory tree. Node's own `fs.globSync` needs Node 22,
 * while the project still supports Node 20 (see package.json engines).
 * Supports `*` within a path segment and `**` across segments.
 */
export function globFilesSync(pattern: string, options: { cwd: string }): string[] {
  const matcher = patternToRegExp(pattern);
  const found: string[] = [];
  walk(options.cwd, options.cwd, found);
  return found
    .map((absolute) => relative(options.cwd, absolute).split(sep).join("/"))
    .filter((rel) => matcher.test(rel))
    .sort();
}

function walk(dir: string, root: string, found: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, root, found);
    else if (entry.isFile()) found.push(path);
  }
}

function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .split("/")
    .map((segment) => {
      if (segment === "**") return "(?:.+)";
      return segment
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*");
    })
    .join("/")
    .replace(/\(\?:\.\+\)\//g, "(?:.+/)?");
  return new RegExp(`^${source}$`);
}
