/**
 * Shared weekly/monthly MD loader for Console static-top digests.
 * Naming: `{weekly|monthly}-YYYY-MM-DD.md` or monthly `YYYY-MM.md` / `monthly-YYYY-MM.md`.
 */
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { ExecutiveStaticReportSlot } from "../../schemas/executive-home.js";
import { readAgentSummaryBody } from "./agent-inbox.js";
import { getWorkspaceRoot } from "./orgos-paths.js";
import { getDocsReportsDir } from "./utils.js";

export type StaticReportSlot = ExecutiveStaticReportSlot;
export type DigestPeriod = "weekly" | "monthly";

const WEEKLY_DATED = /^weekly-(\d{4}-\d{2}-\d{2})\.md$/;
const MONTHLY_DATED = /^monthly-(\d{4}-\d{2}-\d{2})\.md$/;
const MONTHLY_YM = /^(\d{4}-\d{2})\.md$/;
const MONTHLY_PREFIX_YM = /^monthly-(\d{4}-\d{2})\.md$/;

export function emptyPeriodSlot(
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

export function periodDigestFilename(
  period: DigestPeriod,
  asOf: string,
): string {
  if (period === "weekly") {
    return `weekly-${asOf}.md`;
  }
  if (/^\d{4}-\d{2}$/.test(asOf)) {
    return `${asOf}.md`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return `monthly-${asOf.slice(0, 7)}.md`;
  }
  return `monthly-${asOf}.md`;
}

export function monthTokenFromAsOf(asOf: string): string {
  if (/^\d{4}-\d{2}$/.test(asOf)) return asOf;
  if (/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return asOf.slice(0, 7);
  return asOf;
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

function loadLatest(
  reportsSubdir: string,
  pattern: RegExp,
  emptyTitle: string,
  generate_hint: string,
  titleFallback: (asOf: string, filename: string) => string,
): StaticReportSlot {
  const absDir = join(getDocsReportsDir(), reportsSubdir);
  const latest = listDatedFiles(absDir, pattern)[0];
  if (!latest) {
    return emptyPeriodSlot(emptyTitle, generate_hint);
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
        titleFallback(latest.asOf, latest.filename),
      ),
      as_of: latest.asOf,
      markdown,
      generate_hint,
    };
  } catch {
    return emptyPeriodSlot(emptyTitle, generate_hint);
  }
}

/**
 * Load latest weekly + monthly slots under docs/reports/{subdir}/.
 * Falls back to `legacyPatterns` when period files are missing.
 */
export function loadPeriodDigestSlots(opts: {
  reportsSubdir: string;
  emptyTitle: string;
  generateHintWeekly: string;
  generateHintMonthly: string;
  titleFallback: (period: DigestPeriod, asOf: string) => string;
  legacyPatterns?: RegExp[];
  legacyHint?: string;
}): { weekly: StaticReportSlot; monthly: StaticReportSlot } {
  const weekly = loadLatest(
    opts.reportsSubdir,
    WEEKLY_DATED,
    opts.emptyTitle,
    opts.generateHintWeekly,
    (asOf) => opts.titleFallback("weekly", asOf),
  );

  let monthly = loadLatest(
    opts.reportsSubdir,
    MONTHLY_PREFIX_YM,
    opts.emptyTitle,
    opts.generateHintMonthly,
    (asOf) => opts.titleFallback("monthly", asOf),
  );
  if (monthly.path == null) {
    monthly = loadLatest(
      opts.reportsSubdir,
      MONTHLY_YM,
      opts.emptyTitle,
      opts.generateHintMonthly,
      (asOf) => opts.titleFallback("monthly", asOf),
    );
  }
  if (monthly.path == null) {
    monthly = loadLatest(
      opts.reportsSubdir,
      MONTHLY_DATED,
      opts.emptyTitle,
      opts.generateHintMonthly,
      (asOf) => opts.titleFallback("monthly", asOf),
    );
  }

  const legacyHint = opts.legacyHint ?? opts.generateHintWeekly;
  if (weekly.path == null && opts.legacyPatterns?.length) {
    for (const pattern of opts.legacyPatterns) {
      const legacy = loadLatest(
        opts.reportsSubdir,
        pattern,
        opts.emptyTitle,
        legacyHint,
        (asOf) => opts.titleFallback("weekly", asOf),
      );
      if (legacy.path != null) {
        return {
          weekly: legacy,
          monthly:
            monthly.path != null
              ? monthly
              : emptyPeriodSlot(opts.emptyTitle, opts.generateHintMonthly),
        };
      }
    }
  }

  return {
    weekly:
      weekly.path != null
        ? weekly
        : emptyPeriodSlot(opts.emptyTitle, opts.generateHintWeekly),
    monthly:
      monthly.path != null
        ? monthly
        : emptyPeriodSlot(opts.emptyTitle, opts.generateHintMonthly),
  };
}

export function preferPeriodSlot(slots: {
  weekly: StaticReportSlot;
  monthly: StaticReportSlot;
}): StaticReportSlot {
  if (slots.weekly.path != null) return slots.weekly;
  if (slots.monthly.path != null) return slots.monthly;
  return slots.weekly;
}
