/**
 * Latest static executive reports under tenants/{id}/docs/reports/.
 * Primary Operator Console `/` surface (ADR 0065).
 */
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { ExecutiveStaticReportSlot } from "../../../schemas/executive-home.js";
import { readAgentSummaryBody } from "../agent-inbox.js";
import { getWorkspaceRoot } from "../orgos-paths.js";
import { getDocsReportsDir } from "../utils.js";

const DATE_MD = /^(\d{4}-\d{2}-\d{2})\.md$/;
const WEEKLY_BRIEF = /^weekly-brief-(\d{4}-\d{2}-\d{2})\.md$/;
const MONTHLY_MD = /^(\d{4}-\d{2})\.md$/;
const MONTHLY_AUDIT = /^monthly-audit-(\d{4}-\d{2})\.md$/;

const HINT_DAILY = "orgos dashboard";
const HINT_WEEKLY = "orgos executive brief";
const HINT_MONTHLY = "orgos report monthly  (fallback: orgos events audit monthly)";

function repoRelativeFromAbs(absPath: string): string {
  return relative(getWorkspaceRoot(), absPath).replace(/\\/g, "/");
}

function extractTitle(markdown: string, fallback: string): string {
  const m = markdown.match(/^#\s+(.+)$/m);
  const title = m?.[1]?.trim();
  return title && title.length > 0 ? title : fallback;
}

function emptySlot(title: string, generate_hint: string): ExecutiveStaticReportSlot {
  return {
    path: null,
    title,
    as_of: null,
    markdown: null,
    generate_hint,
  };
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

function loadSlot(opts: {
  absDir: string;
  pattern: RegExp;
  emptyTitle: string;
  generate_hint: string;
  titleFallback: (asOf: string, filename: string) => string;
}): ExecutiveStaticReportSlot {
  const latest = listDatedFiles(opts.absDir, opts.pattern)[0];
  if (!latest) {
    return emptySlot(opts.emptyTitle, opts.generate_hint);
  }
  const rel = repoRelativeFromAbs(latest.abs);
  try {
    const markdown = readAgentSummaryBody(rel);
    return {
      path: rel,
      title: extractTitle(markdown, opts.titleFallback(latest.asOf, latest.filename)),
      as_of: latest.asOf,
      markdown,
      generate_hint: opts.generate_hint,
    };
  } catch {
    return emptySlot(opts.emptyTitle, opts.generate_hint);
  }
}

/**
 * Resolve daily / weekly / monthly static report slots for Executive Home.
 *
 * Resolution:
 * - daily: latest `dashboard/YYYY-MM-DD.md` (top-level only; skips `today-digest/` and non-date names)
 * - weekly: latest `executive-brief/weekly-brief-YYYY-MM-DD.md`
 * - monthly: latest `monthly/YYYY-MM.md` (`orgos report monthly`); else
 *   `agent-summaries/records-audit/monthly-audit-YYYY-MM.md`
 */
export function loadExecutiveStaticReports(): {
  daily: ExecutiveStaticReportSlot;
  weekly: ExecutiveStaticReportSlot;
  monthly: ExecutiveStaticReportSlot;
} {
  const reports = getDocsReportsDir();

  const daily = loadSlot({
    absDir: join(reports, "dashboard"),
    pattern: DATE_MD,
    emptyTitle: "日次ダッシュボード",
    generate_hint: HINT_DAILY,
    titleFallback: (asOf) => `日次ダッシュボード ${asOf}`,
  });

  const weekly = loadSlot({
    absDir: join(reports, "executive-brief"),
    pattern: WEEKLY_BRIEF,
    emptyTitle: "週次ブリーフ",
    generate_hint: HINT_WEEKLY,
    titleFallback: (asOf) => `週次ブリーフ ${asOf}`,
  });

  const monthlyPrimary = loadSlot({
    absDir: join(reports, "monthly"),
    pattern: MONTHLY_MD,
    emptyTitle: "月次レポート",
    generate_hint: HINT_MONTHLY,
    titleFallback: (asOf) => `月次レポート ${asOf}`,
  });

  const monthly =
    monthlyPrimary.path != null
      ? monthlyPrimary
      : loadSlot({
          absDir: join(reports, "agent-summaries", "records-audit"),
          pattern: MONTHLY_AUDIT,
          emptyTitle: "月次レポート",
          generate_hint: HINT_MONTHLY,
          titleFallback: (asOf) => `月次監査 ${asOf}`,
        });

  return { daily, weekly, monthly };
}
