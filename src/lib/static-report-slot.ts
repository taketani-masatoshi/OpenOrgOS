/**
 * Latest dated Markdown under docs/reports/{subdir}/ for Console static-first tabs.
 * Mirrors Executive Home slots (ADR 0065) for tax / contracts / sales digests.
 */
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { ExecutiveStaticReportSlot } from "../../schemas/executive-home.js";
import { readAgentSummaryBody } from "./agent-inbox.js";
import { getWorkspaceRoot } from "./orgos-paths.js";
import { getDocsReportsDir } from "./utils.js";

export type StaticReportSlot = ExecutiveStaticReportSlot;

export function emptyStaticReportSlot(
  title: string,
  generate_hint: string,
): StaticReportSlot {
  return {
    path: null,
    title,
    as_of: null,
    markdown: null,
    generate_hint,
  };
}

function repoRelativeFromAbs(absPath: string): string {
  return relative(getWorkspaceRoot(), absPath).replace(/\\/g, "/");
}

function extractTitle(markdown: string, fallback: string): string {
  const m = markdown.match(/^#\s+(.+)$/m);
  const title = m?.[1]?.trim();
  return title && title.length > 0 ? title : fallback;
}

function listDatedFiles(
  absDir: string,
  pattern: RegExp,
): Array<{ filename: string; asOf: string; abs: string }> {
  if (!existsSync(absDir)) return [];
  const out: Array<{ filename: string; asOf: string; abs: string }> = [];
  for (const name of readdirSync(absDir, { withFileTypes: true })) {
    if (!name.isFile()) continue;
    const m = name.name.match(pattern);
    if (!m) continue;
    out.push({ filename: name.name, asOf: m[1]!, abs: join(absDir, name.name) });
  }
  out.sort((a, b) => (a.asOf < b.asOf ? 1 : a.asOf > b.asOf ? -1 : 0));
  return out;
}

/**
 * Load the newest matching report under docs/reports/{reportsSubdir}/.
 * `pattern` must capture the as-of token (date or month) in group 1.
 */
export function loadLatestDatedReportSlot(opts: {
  reportsSubdir: string;
  pattern: RegExp;
  emptyTitle: string;
  generate_hint: string;
  titleFallback: (asOf: string, filename: string) => string;
}): StaticReportSlot {
  const absDir = join(getDocsReportsDir(), opts.reportsSubdir);
  const latest = listDatedFiles(absDir, opts.pattern)[0];
  if (!latest) {
    return emptyStaticReportSlot(opts.emptyTitle, opts.generate_hint);
  }
  const repoRel = repoRelativeFromAbs(latest.abs);
  const docsRel = (() => {
    const marker = "/docs/";
    const idx = repoRel.indexOf(marker);
    if (idx >= 0) return `docs/${repoRel.slice(idx + marker.length)}`;
    return repoRel.startsWith("docs/") ? repoRel : repoRel;
  })();
  try {
    const markdown = readAgentSummaryBody(docsRel);
    return {
      path: docsRel,
      title: extractTitle(
        markdown,
        opts.titleFallback(latest.asOf, latest.filename),
      ),
      as_of: latest.asOf,
      markdown,
      generate_hint: opts.generate_hint,
    };
  } catch {
    return emptyStaticReportSlot(opts.emptyTitle, opts.generate_hint);
  }
}

export function loadTaxDigestSlot(): StaticReportSlot {
  return loadLatestDatedReportSlot({
    reportsSubdir: "tax",
    pattern: /^tax-digest-(\d{4}-\d{2}-\d{2})\.md$/,
    emptyTitle: "税務ダイジェスト",
    generate_hint: "orgos tax digest --write",
    titleFallback: (asOf) => `税務ダイジェスト — ${asOf}`,
  });
}

export function loadContractsDigestSlot(): StaticReportSlot {
  return loadLatestDatedReportSlot({
    reportsSubdir: "contracts",
    pattern: /^status-(\d{4}-\d{2}-\d{2})\.md$/,
    emptyTitle: "契約ステータス",
    generate_hint: "orgos contracts digest --write",
    titleFallback: (asOf) => `契約ステータス — ${asOf}`,
  });
}

export function loadSalesDigestSlot(): StaticReportSlot {
  return loadLatestDatedReportSlot({
    reportsSubdir: "sales",
    pattern: /^digest-(\d{4}-\d{2}-\d{2})\.md$/,
    emptyTitle: "営業ダイジェスト",
    generate_hint: "orgos sales digest --write",
    titleFallback: (asOf) => `営業ダイジェスト — ${asOf}`,
  });
}
