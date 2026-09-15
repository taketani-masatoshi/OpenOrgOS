/**
 * Sole-prop calendar year SSOT — explicit query/flag → setup.calendar_year → clock.
 * Avoids BFF/CLI/validate using different wall-clock defaults (klab CY2025 vs clock 2026).
 * Reads setup YAML lightly to avoid circular imports with sole-proprietor-clarify.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { getDataDir } from "../utils.js";

function setupCalendarYear(): number | undefined {
  const path = join(getDataDir(), "finance", "blue-return-setup.yaml");
  if (!existsSync(path)) return undefined;
  try {
    const doc = YAML.parse(readFileSync(path, "utf-8")) as { calendar_year?: unknown };
    const y = doc?.calendar_year;
    if (typeof y === "number" && Number.isFinite(y)) return y;
  } catch {
    /* malformed setup — fall through */
  }
  return undefined;
}

export function resolveSolePropCalendarYear(opts?: {
  explicit?: number | string | null;
  clock?: Date;
}): number {
  const raw = opts?.explicit;
  if (raw != null && raw !== "") {
    const n = typeof raw === "number" ? raw : Number.parseInt(String(raw).trim(), 10);
    if (Number.isFinite(n) && n >= 1900 && n <= 2100) {
      return n;
    }
  }
  const fromSetup = setupCalendarYear();
  if (fromSetup != null) return fromSetup;
  return (opts?.clock ?? new Date()).getFullYear();
}

/** Period string for presentation-sanity (YYYY or YYYY-MM). */
export function resolveSolePropPeriod(opts?: {
  explicit?: string | null;
  clock?: Date;
}): string {
  const e = opts?.explicit?.trim();
  if (e && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(e)) {
    return e;
  }
  return String(resolveSolePropCalendarYear({ clock: opts?.clock }));
}
