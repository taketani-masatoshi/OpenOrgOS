import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ControlDefinition } from "../../../../schemas/control-framework.js";
import { getTenantDir, resolveTenantPath } from "../../tenant.js";

function matchesGlobPattern(tenantRelPath: string, pattern: string): boolean {
  const normalized = tenantRelPath.replace(/\\/g, "/");
  const normalizedPattern = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalizedPattern.includes("*")) return normalized === normalizedPattern;

  const base = normalizedPattern
    .replace(/\/\*\*\/\*$/, "")
    .replace(/\/\*\*$/, "")
    .replace(/\*\*$/, "");
  return !base || normalized.startsWith(base.replace(/\/$/, ""));
}

function listFilesRecursive(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFilesRecursive(path);
    return entry.isFile() ? [path] : [];
  });
}

const TEMPLATE_PLACEHOLDER = /\{[A-Z][A-Z0-9_]*\}/;

function evidenceFileIsUnfilled(path: string): boolean {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    return false;
  }
  if (path.endsWith(".csv")) {
    return text.split(/\r?\n/).filter((line) => line.trim()).length <= 1;
  }
  return path.endsWith(".md") && TEMPLATE_PLACEHOLDER.test(text);
}

function evidencePathSatisfied(pattern: string): boolean {
  if (!pattern.includes("*")) {
    const path = resolveTenantPath(pattern);
    return existsSync(path) && (!statSync(path).isFile() || !evidenceFileIsUnfilled(path));
  }

  const base = pattern
    .replace(/\/\*\*\/\*$/, "")
    .replace(/\/\*\*$/, "")
    .replace(/\*\*$/, "")
    .replace(/\/$/, "");
  const path = resolveTenantPath(base);
  if (!existsSync(path)) return false;
  if (statSync(path).isFile()) return true;

  const files = listFilesRecursive(path);
  if (!files.length) return false;
  const tenantPrefix = `${getTenantDir()}/`;
  const relativeFiles = files.map((file) => file.replace(tenantPrefix, "").replace(/\\/g, "/"));
  return (
    relativeFiles.some((file) => matchesGlobPattern(file, pattern)) ||
    pattern.endsWith("/**/*") ||
    pattern.endsWith("/**")
  );
}

export function missingEvidencePaths(control: ControlDefinition): string[] {
  return control.evidence_paths.filter((path) => !evidencePathSatisfied(path));
}

export function describeMissingEvidence(control: ControlDefinition): string[] {
  return missingEvidencePaths(control).map((path) => {
    if (path.includes("*")) return `${path}（記録なし）`;
    if (!existsSync(resolveTenantPath(path))) return `${path}（未作成）`;
    return `${path}（様式が未記入）`;
  });
}

export function hasEvidenceForControl(control: ControlDefinition): boolean {
  if (!control.evidence_paths.length) return true;
  const missing = missingEvidencePaths(control);
  return control.evidence_mode === "all"
    ? missing.length === 0
    : missing.length < control.evidence_paths.length;
}
