import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getTenantDir } from "../src/lib/tenant.js";
import { scanIngestInbox } from "../src/lib/finance/ingest/store.js";
import { parseIngestFile } from "../src/lib/finance/ingest/parse.js";
import { classifyIngestStaging } from "../src/lib/finance/ingest/classify.js";
import { postIngestBatch } from "../src/lib/finance/ingest/post.js";
import { loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import { loadIngestStaging, saveIngestStaging } from "../src/lib/finance/ingest/store.js";
import { writeYamlFile } from "../src/lib/utils.js";

const TENANT = "_fixture-sole-prop";

describe("finance ingest e2e (sole-prop fixture)", () => {
  beforeEach(() => {
    setTenantId(TENANT);
    const base = join(getTenantDir(), "data/finance");
    writeFileSync(join(base, "journal-entries.yaml"), "version: 1\nentries: []\n", "utf-8");
    writeFileSync(join(base, "period-locks.yaml"), "version: 1\nlocks: []\n", "utf-8");
    saveIngestStaging({ version: 1, batches: [], rows: [] });
    writeYamlFile(join(getTenantDir(), "data/finance/ingest-rules.yaml"), {
      version: 1,
      default_cash_account_code: "1100",
      default_revenue_account_code: "4100",
      asset_intake_threshold_yen: 100000,
      rules: [
        {
          id: "stationery",
          match: { contains: "文具" },
          account_code: "5210",
          tax_category: "taxable_10",
          business_pct: 100,
          priority: 50,
        },
      ],
    });
    writeYamlFile(join(getTenantDir(), "data/document-io.yaml"), {
      inbox_items: [],
      outbox_items: [],
    });
  });

  afterEach(() => {
    setTenantId(TENANT);
  });

  it("scan → parse → classify → post card csv", () => {
    setTenantId(TENANT);
    const dir = join(getTenantDir(), "docs/io/inbox/card");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "sample-card.csv");
    writeFileSync(
      file,
      `date,amount,description,payee,category
2025-06-10,1500,文具,アスクル,消耗品費
`,
      "utf-8",
    );

    const scan = scanIngestInbox({ write: true });
    expect(scan.registered.length).toBeGreaterThanOrEqual(1);

    const parsed = parseIngestFile({
      source: "card",
      filePath: "docs/io/inbox/card/sample-card.csv",
      write: true,
    });
    expect(parsed.added_rows).toBe(1);
    expect(parsed.batch_id).toBeTruthy();

    const classified = classifyIngestStaging({ write: true });
    expect(classified.classified).toBeGreaterThanOrEqual(1);

    const posted = postIngestBatch({
      batchId: parsed.batch_id!,
      write: true,
      authorizedBy: "test",
    });
    expect(posted.errors).toEqual([]);
    expect(posted.posted).toBe(1);

    const je = loadJournalEntries();
    const ingestEntries = je.entries.filter((e) => e.source?.kind === "ingest");
    expect(ingestEntries.length).toBe(1);
    expect(ingestEntries[0]!.evidence_refs.some((r) => r.startsWith("inbox:"))).toBe(
      true,
    );

    // cleanup sample file
    if (existsSync(file)) rmSync(file);
  });
});
