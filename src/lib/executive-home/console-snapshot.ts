/**
 * Precomputed Operator Console pages (weekly / monthly).
 * HTTP GET reads these files; `orgos dashboard` writes them.
 * Live cash is overlaid from cash-balance.yaml (L1 total only).
 * Path: src/lib/executive-home/console-snapshot.ts
 * ADR: docs/adr/0065-executive-home-console.md
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  executiveHomeSchema,
  type ExecutiveHome,
} from "../../../schemas/executive-home.js";
import { loadCashBalance, resolveCashBalanceTotal } from "../data.js";
import {
  buildAnalyticsDashboardPayload,
  type AnalyticsDashboardPayload,
} from "../canvas-views/builders/analytics-dashboard.js";
import {
  currentDate,
  ensureDocsReportsDir,
  writeCanonicalFile,
} from "../utils.js";
import { buildExecutiveHome } from "./build-home.js";

export const CONSOLE_HOME_SNAPSHOT = "console-home.json";
export const CONSOLE_ANALYTICS_SNAPSHOT = "console-analytics.json";

function dashboardReportDir(): string {
  return ensureDocsReportsDir("dashboard");
}

export function consoleHomeSnapshotPath(): string {
  return join(dashboardReportDir(), CONSOLE_HOME_SNAPSHOT);
}

export function consoleAnalyticsSnapshotPath(): string {
  return join(dashboardReportDir(), CONSOLE_ANALYTICS_SNAPSHOT);
}

/** Confirmed cash total only — never account numbers. */
export function loadLiveCashBalanceYen(): number | null {
  const cash = loadCashBalance();
  if (!cash || cash.status !== "confirmed") return null;
  return resolveCashBalanceTotal(cash);
}

export function overlayLiveCash(home: ExecutiveHome): ExecutiveHome {
  const cash = loadLiveCashBalanceYen();
  if (cash == null) return home;
  return { ...home, finance_cash_balance: cash };
}

function warnUnreadableSnapshot(path: string, err: unknown): void {
  console.warn(
    `${path} unreadable; serving live (${err instanceof Error ? err.message : String(err)})`,
  );
}

export function loadConsoleHomeSnapshot(): ExecutiveHome | null {
  const path = consoleHomeSnapshotPath();
  if (!existsSync(path)) return null;
  try {
    return executiveHomeSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  } catch (err) {
    warnUnreadableSnapshot(path, err);
    return null;
  }
}

export function loadConsoleAnalyticsSnapshot(): AnalyticsDashboardPayload | null {
  const path = consoleAnalyticsSnapshotPath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as AnalyticsDashboardPayload;
    if (!parsed?.kpi || !parsed.view_model) return null;
    return parsed;
  } catch (err) {
    warnUnreadableSnapshot(path, err);
    return null;
  }
}

export function writeConsoleHomeSnapshot(home: ExecutiveHome): string {
  const stamped: ExecutiveHome = executiveHomeSchema.parse({
    ...home,
    served_from: "snapshot",
    generated_at: new Date().toISOString(),
  });
  const path = consoleHomeSnapshotPath();
  // gitignored reports JSON — writeTrackedFile would redact 7-digit yen totals
  // into invalid JSON (`[REDACTED-L2]`), so GET would fall back to live compose.
  writeCanonicalFile(path, `${JSON.stringify(stamped, null, 2)}\n`);
  return path;
}

export function writeConsoleAnalyticsSnapshot(
  payload: AnalyticsDashboardPayload,
): string {
  const stamped: AnalyticsDashboardPayload = {
    ...payload,
    served_from: "snapshot",
    generated_at: new Date().toISOString(),
  };
  const path = consoleAnalyticsSnapshotPath();
  writeCanonicalFile(path, `${JSON.stringify(stamped, null, 2)}\n`);
  return path;
}

/** CLI / pipeline: compose once and store for the console to read. */
export function writeConsolePageSnapshots(): {
  home: string;
  analytics: string;
} {
  const home = writeConsoleHomeSnapshot(buildExecutiveHome());
  const analytics = writeConsoleAnalyticsSnapshot(
    buildAnalyticsDashboardPayload({ expensive: "cached" }),
  );
  return { home, analytics };
}

/**
 * Fast path for GET /chat/v1/executive/home.
 * `live: true` recomputes from YAML (Refresh). Default serves the last dashboard
 * file and overlays confirmed cash.
 */
export function serveExecutiveHome(opts?: { live?: boolean }): ExecutiveHome {
  if (!opts?.live) {
    const snap = loadConsoleHomeSnapshot();
    if (snap) {
      return overlayLiveCash({
        ...snap,
        served_from: "snapshot",
        generated_at: snap.generated_at ?? currentDate(),
      });
    }
  }
  return {
    ...buildExecutiveHome(),
    served_from: "live",
    generated_at: new Date().toISOString(),
  };
}

export function serveAnalyticsDashboard(opts?: {
  live?: boolean;
}): AnalyticsDashboardPayload {
  if (!opts?.live) {
    const snap = loadConsoleAnalyticsSnapshot();
    if (snap) {
      return {
        ...snap,
        served_from: "snapshot",
        generated_at: snap.generated_at ?? currentDate(),
      };
    }
  }
  return {
    ...buildAnalyticsDashboardPayload({ expensive: "cached" }),
    served_from: "live",
    generated_at: new Date().toISOString(),
  };
}
