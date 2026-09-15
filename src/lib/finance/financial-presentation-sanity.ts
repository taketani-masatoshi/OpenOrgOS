/**
 * Financial presentation sanity — deterministic checks (ADR 0069 financial).
 * LLM does not judge. CLI / workpapers / validate consume findings.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { getDataDir, writeYamlFile } from "../utils.js";
import { loadTenantConfig } from "../tenant.js";
import { loadEnabledModulesSafe } from "../modules.js";
import { loadJournalEntries } from "./expense-claim-journal.js";
import {
  buildBalanceSheet,
  OWNER_DRAW_ACCOUNT_CODE,
} from "./ledger/balance-sheet.js";
import { loadOpeningBalances } from "./ledger/opening-balance.js";
import { normalizeJournalEntry } from "../../../schemas/finance/journal-entry.js";
import { loadBlueReturnSetup } from "./sole-proprietor-clarify.js";

export type PresentationSanityLevel = "error" | "warning" | "info";

export type PresentationSanityFinding = {
  code: string;
  level: PresentationSanityLevel;
  message: string;
};

export type PresentationSnapshot = {
  captured_at: string;
  journal_hash: string;
  corporate_total_assets_yen: number;
  blue_total_assets_yen: number | null;
  owner_draw_yen: number | null;
  owner_draw_section: "asset" | "equity" | "missing" | null;
};

export type PresentationSanityResult = {
  period: string;
  as_of: string;
  sole_prop: boolean;
  metrics: PresentationSnapshot;
  findings: PresentationSanityFinding[];
  baseline: PresentationSnapshot | null;
};

type SnapshotFile = {
  version: number;
  by_period: Record<string, PresentationSnapshot>;
};

function periodAsOf(period: string): { asOf: string; from: string } {
  if (/^\d{4}$/.test(period)) {
    return { asOf: `${period}-12-31`, from: `${period}-01-01` };
  }
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split("-");
    const last = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
    return {
      asOf: `${period}-${String(last).padStart(2, "0")}`,
      from: `${period}-01`,
    };
  }
  return { asOf: period, from: period };
}

function snapshotPath(): string {
  return join(getDataDir(), "audit", "presentation-snapshot.yaml");
}

export function loadPresentationSnapshots(): SnapshotFile {
  const path = snapshotPath();
  if (!existsSync(path)) {
    return { version: 1, by_period: {} };
  }
  const raw = YAML.parse(readFileSync(path, "utf-8")) as SnapshotFile;
  return {
    version: raw.version ?? 1,
    by_period: raw.by_period ?? {},
  };
}

export function savePresentationSnapshot(
  period: string,
  snap: PresentationSnapshot,
): string {
  const file = loadPresentationSnapshots();
  file.by_period[period] = snap;
  const path = snapshotPath();
  mkdirSync(join(getDataDir(), "audit"), { recursive: true });
  writeYamlFile(path, file);
  return path;
}

type JournalEntryRow = ReturnType<typeof loadJournalEntries>["entries"][number];

/**
 * Fingerprint aligned with trial balance / BS: journals with occurred_at ≤ asOf
 * (excluding dates ≤ opening.as_of when opening is in force) plus opening lines.
 */
export function computeJournalHash(period: string): string {
  const { asOf } = periodAsOf(period);
  const toDay = asOf.slice(0, 10);
  let entries: JournalEntryRow[] = [];
  try {
    entries = loadJournalEntries().entries;
  } catch {
    entries = [];
  }

  const opening = loadOpeningBalances();
  const openingAsOf = opening?.as_of;
  const includeOpening = Boolean(opening && openingAsOf && toDay >= openingAsOf);

  const rows = entries
    .filter((e) => {
      const d = e.occurred_at.slice(0, 10);
      if (d > toDay) return false;
      if (includeOpening && openingAsOf && d <= openingAsOf) return false;
      return true;
    })
    .map((e) => normalizeJournalEntry(e))
    .sort((a, b) => a.entry_id.localeCompare(b.entry_id));

  const journalPayload = rows
    .map((e) => `${e.entry_id}|${e.occurred_at}|${JSON.stringify(e.lines)}`)
    .join("\n");

  let openingPayload = "";
  if (includeOpening && opening) {
    const lines = [...opening.lines].sort((a, b) =>
      a.account_code.localeCompare(b.account_code),
    );
    openingPayload = `opening|${opening.as_of}|${JSON.stringify(lines)}`;
  }

  const payload = [openingPayload, journalPayload].filter(Boolean).join("\n");
  return createHash("sha256").update(payload).digest("hex");
}

/** Period used by orgos validate: blue-return-setup.calendar_year when sole-prop. */
export function resolvePresentationSanityPeriodForValidate(): string {
  if (isSoleProp()) {
    try {
      const year = loadBlueReturnSetup()?.calendar_year;
      if (typeof year === "number" && Number.isFinite(year)) {
        return String(year);
      }
    } catch {
      /* setup optional */
    }
  }
  return String(new Date().getFullYear());
}

function isSoleProp(): boolean {
  try {
    return loadTenantConfig().entity_form === "sole_proprietorship";
  } catch {
    return false;
  }
}

export function shouldRunPresentationSanityInValidate(): boolean {
  if (isSoleProp()) return true;
  return loadEnabledModulesSafe().some((m) => m.id === "jp_financial_audit");
}

export function assessPresentationSanity(input: {
  period: string;
  updateBaseline?: boolean;
}): PresentationSanityResult {
  const { asOf } = periodAsOf(input.period);
  const sole_prop = isSoleProp();
  const bs = buildBalanceSheet({ asOf });
  const drawAsset = bs.assets.find((l) => l.account_code === OWNER_DRAW_ACCOUNT_CODE);
  const drawEquity = bs.equity.find((l) => l.account_code === OWNER_DRAW_ACCOUNT_CODE);
  let owner_draw_yen: number | null = null;
  let owner_draw_section: PresentationSnapshot["owner_draw_section"] = "missing";
  if (drawAsset) {
    owner_draw_yen = drawAsset.balance_yen;
    owner_draw_section = "asset";
  } else if (drawEquity) {
    owner_draw_yen = drawEquity.balance_yen;
    owner_draw_section = "equity";
  }

  const metrics: PresentationSnapshot = {
    captured_at: new Date().toISOString(),
    journal_hash: computeJournalHash(input.period),
    corporate_total_assets_yen: bs.total_assets_yen,
    blue_total_assets_yen: sole_prop ? bs.total_assets_yen : null,
    owner_draw_yen,
    owner_draw_section: sole_prop ? owner_draw_section : null,
  };

  const findings: PresentationSanityFinding[] = [];
  const file = loadPresentationSnapshots();
  const baseline = file.by_period[input.period] ?? null;

  if (sole_prop) {
    if (owner_draw_section === "asset" && owner_draw_yen != null && owner_draw_yen < 0) {
      findings.push({
        code: "owner_draw_negative_on_blue",
        level: "error",
        message: `事業主貸が資産側で負表示: ${owner_draw_yen}`,
      });
    }
    if (owner_draw_section === "equity" && owner_draw_yen != null && owner_draw_yen < 0) {
      findings.push({
        code: "owner_draw_still_negative_on_corp_bs",
        level: "error",
        message: `事業主貸が純資産側で負のまま（一本化回帰）: ${owner_draw_yen}`,
      });
    }
  }

  if (!baseline) {
    findings.push({
      code: "journal_hash_baseline_missing",
      level: "info",
      message: "表示健全性スナップショット未作成（初回比較不可）",
    });
  } else if (
    baseline.journal_hash === metrics.journal_hash &&
    (Math.abs(baseline.corporate_total_assets_yen - metrics.corporate_total_assets_yen) > 1 ||
      (baseline.blue_total_assets_yen != null &&
        metrics.blue_total_assets_yen != null &&
        Math.abs(baseline.blue_total_assets_yen - metrics.blue_total_assets_yen) > 1))
  ) {
    findings.push({
      code: "presentation_total_jump_journals_unchanged",
      level: "warning",
      message: `仕訳ハッシュ不変なのに資産合計が変化（baseline ${baseline.corporate_total_assets_yen} → ${metrics.corporate_total_assets_yen}）。表示再分類の疑い`,
    });
  }

  if (input.updateBaseline) {
    savePresentationSnapshot(input.period, metrics);
  }

  return {
    period: input.period,
    as_of: asOf,
    sole_prop,
    metrics,
    findings,
    baseline,
  };
}

export function formatPresentationSanityMarkdown(
  result: PresentationSanityResult,
): string {
  return [
    `# 表示健全性 — ${result.period}`,
    "",
    `as_of: ${result.as_of} · sole_prop: ${result.sole_prop ? "yes" : "no"}`,
    `journal_hash: \`${result.metrics.journal_hash.slice(0, 12)}…\``,
    `total_assets: ${result.metrics.corporate_total_assets_yen.toLocaleString("ja-JP")}`,
    result.metrics.owner_draw_yen != null
      ? `事業主貸: ${result.metrics.owner_draw_yen.toLocaleString("ja-JP")}（${result.metrics.owner_draw_section}）`
      : "事業主貸: —",
    "",
    "## Findings",
    "",
    "| code | level | message |",
    "|------|-------|---------|",
    ...(result.findings.length
      ? result.findings.map(
          (f) => `| ${f.code} | ${f.level} | ${f.message.replace(/\|/g, "/")} |`,
        )
      : ["| — | — | なし |"]),
    "",
    "機械ルールのみ（LLM 判定なし）。baseline 更新は CLI `--update-baseline` のみ（workpapers は非更新）。",
  ].join("\n");
}
