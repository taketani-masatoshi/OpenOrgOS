/**
 * Shared finance drop-folder scaffold (Zone A docs/io/inbox).
 * Used by sole-prop and corporate bookkeeping modules — not duplicated per module seed.
 *
 * Template SSOT: steward/platform/finance/ingest-inbox/
 * (tenant _template/docs/io is a mirror for human browsing)
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  FINANCE_INGEST_INBOX_CATEGORIES,
  ensureInboxCategoryDir,
} from "../../document-io.js";
import { getInstallRoot } from "../../orgos-paths.js";
import { getDataDir, getDocsDir, toLogicalPath } from "../../utils.js";
import { getTenantTemplateDir } from "../../tenant.js";

/** Modules that should ensure finance ingest inbox on activate. */
export const FINANCE_INGEST_SCAFFOLD_MODULES = new Set([
  "jp_sole_proprietor_blue_return",
  "jp_bank_corporate",
  "jp_tax_corporate",
  "jp_tax_consumption",
  "jp_financial_audit",
  "jp_invoice_qualified",
  "jp_withholding_statutory",
  "jp_payroll",
]);

export type FinanceIngestScaffoldResult = {
  dirs_created: string[];
  readmes_copied: string[];
  rules_seeded: boolean;
  skipped: string[];
};

const CATEGORY_README = "00-このフォルダについて.md";
const IO_INDEX = "00-README.md";

function platformIngestInboxRoot(): string {
  return join(getInstallRoot(), "steward", "platform", "finance", "ingest-inbox");
}

function firstExisting(...paths: string[]): string | null {
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

function categoryReadmeSource(category: string): string | null {
  return firstExisting(
    join(platformIngestInboxRoot(), category, CATEGORY_README),
    join(getTenantTemplateDir(), "docs", "io", "inbox", category, CATEGORY_README),
  );
}

function ioIndexSource(): string | null {
  return firstExisting(
    join(platformIngestInboxRoot(), IO_INDEX),
    join(getTenantTemplateDir(), "docs", "io", IO_INDEX),
  );
}

function ingestRulesSource(): string | null {
  return firstExisting(
    join(getTenantTemplateDir(), "data", "finance", "ingest-rules.yaml.example"),
    join(getTenantTemplateDir(), "data", "finance", "ingest-rules.yaml"),
  );
}

/**
 * Ensure docs/io/inbox/{bank,card,...} exist with template READMEs,
 * plus optional data/finance/ingest-rules.yaml seed.
 * Idempotent — never overwrites existing README/rules.
 */
export function ensureFinanceIngestInboxScaffold(): FinanceIngestScaffoldResult {
  const dirs_created: string[] = [];
  const readmes_copied: string[] = [];
  const skipped: string[] = [];

  const ioDir = join(getDocsDir(), "io");
  mkdirSync(ioDir, { recursive: true });
  const ioIndexAbs = join(ioDir, IO_INDEX);
  const ioIndexSrc = ioIndexSource();
  if (!existsSync(ioIndexAbs) && ioIndexSrc) {
    copyFileSync(ioIndexSrc, ioIndexAbs);
    readmes_copied.push(toLogicalPath(ioIndexAbs));
  }

  for (const cat of FINANCE_INGEST_INBOX_CATEGORIES) {
    const dir = ensureInboxCategoryDir(cat);
    const logical = toLogicalPath(dir);
    dirs_created.push(logical);

    const destReadme = join(dir, CATEGORY_README);
    if (existsSync(destReadme)) {
      skipped.push(logical);
      continue;
    }
    const src = categoryReadmeSource(cat);
    if (src) {
      copyFileSync(src, destReadme);
      readmes_copied.push(toLogicalPath(destReadme));
    } else {
      writeFileSync(
        destReadme,
        `# ${cat}\n\n帳簿インプット投入先（Zone A）。\`orgos ingest\` で取込。\n`,
        "utf-8",
      );
      readmes_copied.push(toLogicalPath(destReadme));
    }
  }

  let rules_seeded = false;
  const rulesDest = join(getDataDir(), "finance", "ingest-rules.yaml");
  const rulesSrc = ingestRulesSource();
  if (!existsSync(rulesDest) && rulesSrc) {
    mkdirSync(join(getDataDir(), "finance"), { recursive: true });
    const text = readFileSync(rulesSrc, "utf-8");
    writeFileSync(rulesDest, text, "utf-8");
    rules_seeded = true;
  }

  return { dirs_created, readmes_copied, rules_seeded, skipped };
}

export function moduleNeedsFinanceIngestScaffold(moduleId: string): boolean {
  return FINANCE_INGEST_SCAFFOLD_MODULES.has(moduleId);
}
