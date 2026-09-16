import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import {
  FINANCE_INGEST_INBOX_CATEGORIES,
  ensureInboxCategoryDir,
  loadDocumentIo,
  registerInboxItemInPlace,
} from "../../document-io.js";
import type { InboxCategory } from "../../../../schemas/document-io.js";
import {
  getDataDir,
  getDocsInboxDir,
  readYamlFile,
  resolveTenantPath,
  toLogicalPath,
  writeYamlFile,
} from "../../utils.js";
import {
  ingestRulesFileSchema,
  ingestStagingFileSchema,
  type IngestRulesFile,
  type IngestSourceKind,
  type IngestStagingFile,
} from "../../../../schemas/finance/ingest.js";
import { ensureFinanceIngestInboxScaffold } from "./scaffold.js";
import { decodeBankCsvBytes } from "../bank-statement-import-service.js";

const STAGING_REL = "finance/ingest-staging.yaml";
const RULES_REL = "finance/ingest-rules.yaml";

const SOURCE_EXTS = new Set([".csv", ".tsv", ".md", ".txt", ".json"]);

export function ingestStagingPath(): string {
  return join(getDataDir(), STAGING_REL);
}

export function ingestRulesPath(): string {
  return join(getDataDir(), RULES_REL);
}

export function loadIngestStaging(): IngestStagingFile {
  const path = ingestStagingPath();
  if (!existsSync(path)) {
    return ingestStagingFileSchema.parse({ version: 1, batches: [], rows: [] });
  }
  return readYamlFile(path, ingestStagingFileSchema);
}

export function saveIngestStaging(file: IngestStagingFile): void {
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  writeYamlFile(ingestStagingPath(), ingestStagingFileSchema.parse(file));
}

export function loadIngestRules(): IngestRulesFile {
  const path = ingestRulesPath();
  if (!existsSync(path)) {
    return ingestRulesFileSchema.parse({
      version: 1,
      default_cash_account_code: "1120",
      default_revenue_account_code: "4100",
      asset_intake_threshold_yen: 100_000,
      rules: [],
    });
  }
  return readYamlFile(path, ingestRulesFileSchema);
}

export function ensureIngestInboxDirs(): string[] {
  const scaffold = ensureFinanceIngestInboxScaffold();
  return scaffold.dirs_ensured;
}

export function categoryToSourceKind(category: InboxCategory): IngestSourceKind | null {
  switch (category) {
    case "bank":
    case "card":
    case "transit":
    case "wallet":
    case "marketplace":
    case "sales":
    case "receipts":
    case "contracts":
      return category;
    default:
      return null;
  }
}

export type IngestScanResult = {
  registered: Array<{ id: string; path: string; category: string }>;
  skipped_existing: number;
  dirs: string[];
};

/** Discover new files under finance ingest inbox dirs and register in document-io. */
export function scanIngestInbox(input?: { write?: boolean }): IngestScanResult {
  const dirs = ensureIngestInboxDirs();
  const io = loadDocumentIo();
  const known = new Set(io.inbox_items.map((i) => i.path));
  const registered: IngestScanResult["registered"] = [];
  let skipped_existing = 0;

  for (const category of FINANCE_INGEST_INBOX_CATEGORIES) {
    const absDir = join(getDocsInboxDir(), category);
    if (!existsSync(absDir)) continue;
    for (const name of readdirSync(absDir)) {
      if (name.startsWith("00-") || name.startsWith(".")) continue;
      const abs = join(absDir, name);
      if (!statSync(abs).isFile()) continue;
      const ext = extname(name).toLowerCase();
      if (ext === ".pdf") {
        // Still register so humans see it; parse will error with guidance.
      } else if (!SOURCE_EXTS.has(ext) && ext !== ".pdf") {
        continue;
      }
      const logical = toLogicalPath(abs);
      if (known.has(logical)) {
        skipped_existing += 1;
        continue;
      }
      if (!input?.write) {
        registered.push({ id: "(dry-run)", path: logical, category });
        continue;
      }
      const item = registerInboxItemInPlace({
        absPath: abs,
        category,
        title: basename(name, ext) || name,
        source: "download",
        notes: "orgos ingest scan",
      });
      registered.push({ id: item.id, path: item.path, category });
      known.add(item.path);
    }
  }

  return { registered, skipped_existing, dirs };
}

export function readInboxFileContent(logicalOrAbs: string): {
  content: string;
  fileName: string;
  absPath: string;
  bytes: Buffer;
  encoding_used?: "utf-8" | "shift_jis";
} {
  const resolved = logicalOrAbs.startsWith("/")
    ? logicalOrAbs
    : resolveTenantPath(logicalOrAbs);
  const bytes = readFileSync(resolved);
  const ext = extname(resolved).toLowerCase();
  if (ext === ".csv" || ext === ".tsv") {
    const decoded = decodeBankCsvBytes(new Uint8Array(bytes));
    return {
      content: decoded.text,
      fileName: basename(resolved),
      absPath: resolved,
      bytes,
      encoding_used: decoded.encoding_used,
    };
  }
  return {
    content: bytes.toString("utf-8"),
    fileName: basename(resolved),
    absPath: resolved,
    bytes,
  };
}
