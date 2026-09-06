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
import {
  loadPeriodDigestSlots,
  preferPeriodSlot,
  type DigestPeriod,
} from "./period-digest-slot.js";

export type { DigestPeriod };

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

export function loadTaxDigestSlots(): { weekly: StaticReportSlot; monthly: StaticReportSlot } {
  return loadPeriodDigestSlots({
    reportsSubdir: "tax",
    emptyTitle: "税務ダイジェスト",
    generateHintWeekly: "orgos tax digest --period weekly --write",
    generateHintMonthly: "orgos tax digest --period monthly --write",
    titleFallback: (period, asOf) =>
      period === "weekly" ? `税務週次 — ${asOf}` : `税務月次 — ${asOf}`,
    legacyPatterns: [/^tax-digest-(\d{4}-\d{2}-\d{2})\.md$/],
    legacyHint: "orgos tax digest --write",
  });
}

export function loadTaxDigestSlot(): StaticReportSlot {
  return preferPeriodSlot(loadTaxDigestSlots());
}

export function loadContractsDigestSlots(): {
  weekly: StaticReportSlot;
  monthly: StaticReportSlot;
} {
  return loadPeriodDigestSlots({
    reportsSubdir: "contracts",
    emptyTitle: "契約ステータス",
    generateHintWeekly: "orgos contracts digest --period weekly --write",
    generateHintMonthly: "orgos contracts digest --period monthly --write",
    titleFallback: (period, asOf) =>
      period === "weekly" ? `契約週次 — ${asOf}` : `契約月次 — ${asOf}`,
    legacyPatterns: [/^status-(\d{4}-\d{2}-\d{2})\.md$/],
    legacyHint: "orgos contracts digest --write",
  });
}

export function loadContractsDigestSlot(): StaticReportSlot {
  return preferPeriodSlot(loadContractsDigestSlots());
}

export function loadSalesDigestSlots(): {
  weekly: StaticReportSlot;
  monthly: StaticReportSlot;
} {
  return loadPeriodDigestSlots({
    reportsSubdir: "sales",
    emptyTitle: "営業ダイジェスト",
    generateHintWeekly: "orgos sales digest --period weekly --write",
    generateHintMonthly: "orgos sales digest --period monthly --write",
    titleFallback: (period, asOf) =>
      period === "weekly" ? `営業週次 — ${asOf}` : `営業月次 — ${asOf}`,
    legacyPatterns: [/^digest-(\d{4}-\d{2}-\d{2})\.md$/],
    legacyHint: "orgos sales digest --write",
  });
}

export function loadSalesDigestSlot(): StaticReportSlot {
  return preferPeriodSlot(loadSalesDigestSlots());
}

export function loadLedgerDigestSlots(): {
  weekly: StaticReportSlot;
  monthly: StaticReportSlot;
} {
  return loadPeriodDigestSlots({
    reportsSubdir: "ledger",
    emptyTitle: "帳簿ダイジェスト",
    generateHintWeekly: "orgos ledger digest --period weekly --write",
    generateHintMonthly: "orgos ledger digest --period monthly --write",
    titleFallback: (period, asOf) =>
      period === "weekly" ? `帳簿週次 — ${asOf}` : `帳簿月次 — ${asOf}`,
  });
}

export function loadLedgerDigestSlot(): StaticReportSlot {
  return preferPeriodSlot(loadLedgerDigestSlots());
}

export function loadBudgetDigestSlots(): {
  weekly: StaticReportSlot;
  monthly: StaticReportSlot;
} {
  return loadPeriodDigestSlots({
    reportsSubdir: "budget",
    emptyTitle: "予算ダイジェスト",
    generateHintWeekly: "orgos budget digest --period weekly --write",
    generateHintMonthly: "orgos budget digest --period monthly --write",
    titleFallback: (period, asOf) =>
      period === "weekly" ? `予算週次 — ${asOf}` : `予算月次 — ${asOf}`,
  });
}

export function loadBudgetDigestSlot(): StaticReportSlot {
  return preferPeriodSlot(loadBudgetDigestSlots());
}

export function loadOrgDigestSlots(): {
  weekly: StaticReportSlot;
  monthly: StaticReportSlot;
} {
  return loadPeriodDigestSlots({
    reportsSubdir: "org",
    emptyTitle: "組織ダイジェスト",
    generateHintWeekly: "orgos org digest --period weekly --write",
    generateHintMonthly: "orgos org digest --period monthly --write",
    titleFallback: (period, asOf) =>
      period === "weekly" ? `組織週次 — ${asOf}` : `組織月次 — ${asOf}`,
  });
}

export function loadOrgDigestSlot(): StaticReportSlot {
  return preferPeriodSlot(loadOrgDigestSlots());
}
