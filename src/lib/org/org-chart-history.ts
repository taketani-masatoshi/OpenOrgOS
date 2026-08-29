import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  orgChartHistoryIndexSchema,
  type OrgChartHistoryEntry,
  type OrgChartHistorySource,
} from "../../../schemas/org/org-chart-history.js";
import type { OrgChartFile } from "../../../schemas/org/org-chart.js";
import { getDataDir, writeYamlFile } from "../utils.js";
import { loadOrgChart, loadOrgChartFromFile } from "./org-chart.js";

const INDEX_NAME = "index.yaml";

export function orgChartHistoryDir(): string {
  return join(getDataDir(), "org", "org-chart-history");
}

function historyIndexPath(): string {
  return join(orgChartHistoryDir(), INDEX_NAME);
}

function isChartYaml(name: string): boolean {
  return (name.endsWith(".yaml") || name.endsWith(".yml")) && name !== INDEX_NAME;
}

function loadIndex(): OrgChartHistoryEntry[] {
  const path = historyIndexPath();
  if (!existsSync(path)) return [];
  return orgChartHistoryIndexSchema.parse(parseYaml(readFileSync(path, "utf-8"))).entries;
}

function snapshotPathFor(opts: { as_of: string; change_id?: string }): string {
  const safeAsOf = opts.as_of;
  const slug = opts.change_id?.replace(/[^A-Za-z0-9._-]/g, "_");
  const name = slug ? `${safeAsOf}--${slug}.yaml` : `${safeAsOf}.yaml`;
  return join(orgChartHistoryDir(), name);
}

export function writeOrgChartSnapshot(
  chart: OrgChartFile,
  meta: {
    source: OrgChartHistorySource;
    recorded_at?: string;
    change_id?: string;
    approval_id?: string;
    notes?: string;
  },
): { file: string; as_of: string } {
  const filePath = snapshotPathFor({ as_of: chart.as_of, change_id: meta.change_id });
  writeYamlFile(filePath, chart);

  const file = filePath.slice(orgChartHistoryDir().length + 1);
  const recorded_at = meta.recorded_at ?? new Date().toISOString();
  const nextEntry: OrgChartHistoryEntry = {
    as_of: chart.as_of,
    recorded_at,
    source: meta.source,
    change_id: meta.change_id,
    approval_id: meta.approval_id,
    notes: meta.notes ?? chart.notes,
    file,
  };

  const existing = loadIndex().filter(
    (e) => !(e.file === file || (e.as_of === nextEntry.as_of && e.change_id === nextEntry.change_id)),
  );
  writeYamlFile(historyIndexPath(), {
    version: 1,
    entries: [...existing, nextEntry],
  });

  return { file, as_of: chart.as_of };
}

function scanSnapshotFiles(): Array<{ file: string; chart: OrgChartFile }> {
  const dir = orgChartHistoryDir();
  if (!existsSync(dir)) return [];
  const rows: Array<{ file: string; chart: OrgChartFile }> = [];
  for (const name of readdirSync(dir)) {
    if (!isChartYaml(name)) continue;
    const chart = loadOrgChartFromFile(join(dir, name));
    if (chart) rows.push({ file: name, chart });
  }
  return rows;
}

export function listOrgChartHistory(): Array<OrgChartHistoryEntry & { current?: boolean }> {
  const current = loadOrgChart();
  const indexed = loadIndex();
  const scanned = scanSnapshotFiles();
  const byKey = new Map<string, OrgChartHistoryEntry & { current?: boolean }>();

  const keyOf = (e: OrgChartHistoryEntry) => e.file ?? `${e.as_of}:${e.change_id ?? ""}`;

  for (const snap of scanned) {
    const fromIndex = indexed.find((e) => e.file === snap.file);
    const entry: OrgChartHistoryEntry & { current?: boolean } = {
      as_of: snap.chart.as_of,
      notes: fromIndex?.notes ?? snap.chart.notes,
      recorded_at: fromIndex?.recorded_at,
      source: fromIndex?.source ?? "board_resolution",
      change_id: fromIndex?.change_id,
      approval_id: fromIndex?.approval_id,
      file: snap.file,
    };
    byKey.set(keyOf(entry), entry);
  }

  for (const e of indexed) {
    if (!byKey.has(keyOf(e))) byKey.set(keyOf(e), { ...e });
  }

  if (current) {
    const already = [...byKey.values()].some((e) => e.as_of === current.as_of && !e.change_id);
    if (!already) {
      byKey.set(`current:${current.as_of}`, {
        as_of: current.as_of,
        notes: current.notes,
        source: "current",
        current: true,
      });
    } else {
      for (const e of byKey.values()) {
        if (e.as_of === current.as_of && !e.change_id) e.current = true;
      }
    }
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.as_of === b.as_of) {
      return (b.recorded_at ?? "").localeCompare(a.recorded_at ?? "");
    }
    return b.as_of.localeCompare(a.as_of);
  });
}

export function loadOrgChartAsOf(asOf?: string): {
  chart: OrgChartFile | null;
  is_historical: boolean;
  viewing_as_of?: string;
} {
  const current = loadOrgChart();
  if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return { chart: current, is_historical: false, viewing_as_of: current?.as_of };
  }
  if (current && current.as_of === asOf) {
    return { chart: current, is_historical: false, viewing_as_of: current.as_of };
  }

  const history = listOrgChartHistory();
  const match = history.find((e) => e.as_of === asOf);
  if (match?.file) {
    const chart = loadOrgChartFromFile(join(orgChartHistoryDir(), match.file));
    if (chart) return { chart, is_historical: true, viewing_as_of: chart.as_of };
  }

  const named = loadOrgChartFromFile(join(orgChartHistoryDir(), `${asOf}.yaml`));
  if (named) return { chart: named, is_historical: true, viewing_as_of: named.as_of };

  for (const snap of scanSnapshotFiles()) {
    if (snap.chart.as_of === asOf) {
      return { chart: snap.chart, is_historical: true, viewing_as_of: snap.chart.as_of };
    }
  }

  return { chart: current, is_historical: false, viewing_as_of: current?.as_of };
}
