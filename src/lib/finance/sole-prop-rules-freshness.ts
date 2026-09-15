/**
 * JP tax rules freshness — human review debt + optional NTA URL checksum watch.
 * Never auto-applies scraped rates (ADR 0052 · tax quality hardening).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { getInstallRoot } from "../tenant.js";
import { getDataDir } from "../utils.js";

export type RulesFreshnessIssue = {
  level: "error" | "warning";
  file: string;
  message: string;
};

export type RulesFreshnessDoc = {
  version?: number;
  reviewed_on?: string;
  review_interval_months?: number;
  notes?: string;
  source_urls?: string[];
  known_pending_changes?: string[];
};

const FRESHNESS_RELS = [
  "steward/jurisdiction-packs/JP/modules/jp_sole_proprietor_blue_return/rules-freshness.yaml",
  "steward/jurisdiction-packs/JP/modules/jp_tax_consumption/rules-freshness.yaml",
  "steward/jurisdiction-packs/JP/modules/jp_withholding_statutory/rules-freshness.yaml",
] as const;

function assessOneDoc(
  rel: string,
  doc: RulesFreshnessDoc | null,
  asOf: Date,
): RulesFreshnessIssue[] {
  if (!doc) {
    return [
      {
        level: "warning",
        file: rel,
        message: "rules-freshness.yaml 未配置（法令レビュー日付の追跡なし）",
      },
    ];
  }
  if (!doc.reviewed_on || !/^\d{4}-\d{2}-\d{2}$/.test(doc.reviewed_on)) {
    return [
      {
        level: "warning",
        file: rel,
        message: "reviewed_on 未設定 — 年次で税務ルールを見直すこと",
      },
    ];
  }
  const months = doc.review_interval_months ?? 12;
  const reviewed = new Date(`${doc.reviewed_on}T00:00:00Z`);
  const due = new Date(reviewed);
  due.setUTCMonth(due.getUTCMonth() + months);
  const issues: RulesFreshnessIssue[] = [];
  if (asOf.getTime() > due.getTime()) {
    issues.push({
      level: "warning",
      file: rel,
      message: `法令レビュー期限超過（reviewed_on=${doc.reviewed_on} · 間隔 ${months} か月）`,
    });
  }
  // known_pending_changes are documentation for humans — not a permanent validate warning.
  return issues;
}

export function loadRulesFreshnessDoc(rel: string): RulesFreshnessDoc | null {
  const path = join(getInstallRoot(), rel);
  if (!existsSync(path)) return null;
  return YAML.parse(readFileSync(path, "utf-8")) as RulesFreshnessDoc;
}

/** Review-date freshness for sole-prop + consumption + withholding packs. */
export function assessRulesFreshness(asOf = new Date()): RulesFreshnessIssue[] {
  const out: RulesFreshnessIssue[] = [];
  for (const rel of FRESHNESS_RELS) {
    out.push(...assessOneDoc(rel, loadRulesFreshnessDoc(rel), asOf));
  }
  return out;
}

export type RulesWatchResult = {
  url: string;
  source_file: string;
  status: "unchanged" | "changed" | "fetch_error" | "new";
  etag?: string;
  content_hash?: string;
  error?: string;
};

type WatchCache = {
  version: number;
  by_url: Record<
    string,
    { content_hash: string; etag?: string; checked_at: string }
  >;
};

function watchCachePath(): string {
  return join(getDataDir(), "audit", "tax-rules-watch-cache.yaml");
}

function loadWatchCache(): WatchCache {
  const path = watchCachePath();
  if (!existsSync(path)) return { version: 1, by_url: {} };
  const raw = YAML.parse(readFileSync(path, "utf-8")) as WatchCache;
  return { version: raw.version ?? 1, by_url: raw.by_url ?? {} };
}

function saveWatchCache(cache: WatchCache): void {
  const path = watchCachePath();
  mkdirSync(join(getDataDir(), "audit"), { recursive: true });
  writeFileSync(path, YAML.stringify(cache), "utf-8");
}

function collectSourceUrls(): Array<{ url: string; source_file: string }> {
  const rows: Array<{ url: string; source_file: string }> = [];
  for (const rel of FRESHNESS_RELS) {
    const doc = loadRulesFreshnessDoc(rel);
    for (const url of doc?.source_urls ?? []) {
      if (typeof url === "string" && url.startsWith("http")) {
        rows.push({ url, source_file: rel });
      }
    }
  }
  return rows;
}

async function fetchChecksum(
  url: string,
): Promise<{ content_hash: string; etag?: string } | { error: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "OrgOS-tax-rules-watch/1.0 (+https://oorgos.org)" },
      redirect: "follow",
    });
    if (!res.ok) {
      return { error: `HTTP ${res.status}` };
    }
    const etag = res.headers.get("etag") ?? undefined;
    const body = Buffer.from(await res.arrayBuffer());
    const content_hash = createHash("sha256").update(body).digest("hex");
    return { content_hash, etag };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Compare live NTA (etc.) pages to cached checksums.
 * Does not mutate tax constants — human must review and update TS/YAML + reviewed_on.
 */
export async function watchTaxRulesSources(opts?: {
  writeCache?: boolean;
}): Promise<{ results: RulesWatchResult[]; issues: RulesFreshnessIssue[] }> {
  const cache = loadWatchCache();
  const results: RulesWatchResult[] = [];
  const issues: RulesFreshnessIssue[] = [];
  const now = new Date().toISOString();

  for (const { url, source_file } of collectSourceUrls()) {
    const fetched = await fetchChecksum(url);
    if ("error" in fetched) {
      results.push({
        url,
        source_file,
        status: "fetch_error",
        error: fetched.error,
      });
      issues.push({
        level: "warning",
        file: source_file,
        message: `rules-watch fetch 失敗: ${url} — ${fetched.error}`,
      });
      continue;
    }
    const prev = cache.by_url[url];
    if (!prev) {
      results.push({
        url,
        source_file,
        status: "new",
        content_hash: fetched.content_hash,
        etag: fetched.etag,
      });
      cache.by_url[url] = {
        content_hash: fetched.content_hash,
        etag: fetched.etag,
        checked_at: now,
      };
      continue;
    }
    if (prev.content_hash !== fetched.content_hash) {
      results.push({
        url,
        source_file,
        status: "changed",
        content_hash: fetched.content_hash,
        etag: fetched.etag,
      });
      issues.push({
        level: "warning",
        file: source_file,
        message: `NTA 等の公開ページが変化: ${url} — 定数を人手レビューし reviewed_on を更新（自動適用しない）`,
      });
      cache.by_url[url] = {
        content_hash: fetched.content_hash,
        etag: fetched.etag,
        checked_at: now,
      };
    } else {
      results.push({
        url,
        source_file,
        status: "unchanged",
        content_hash: fetched.content_hash,
        etag: fetched.etag,
      });
      cache.by_url[url] = { ...prev, checked_at: now };
    }
  }

  if (opts?.writeCache !== false) {
    saveWatchCache(cache);
  }
  return { results, issues };
}

export function taxRulesWatchEnabled(): boolean {
  return process.env.ORGOS_TAX_RULES_WATCH === "1";
}

export { FRESHNESS_RELS };
