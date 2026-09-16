import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId, getTenantDir } from "../src/lib/tenant.js";
import { saveIngestStaging, loadIngestStaging } from "../src/lib/finance/ingest/store.js";
import { parseIngestFile } from "../src/lib/finance/ingest/parse.js";
import { classifyIngestStaging } from "../src/lib/finance/ingest/classify.js";
import { postIngestBatch } from "../src/lib/finance/ingest/post.js";
import { loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import { writeYamlFile } from "../src/lib/utils.js";
import { runIngestStatus } from "../src/commands/ingest.js";
import { dateToJournalOccurredAt } from "../src/lib/finance/ingest/journal-time.js";
import { buildFinanceIngestStatusPayload } from "../src/lib/steward-chat/routes/finance-ingest-api.js";

describe("finance ingest hardening", () => {
  describe("sole-prop fixture", () => {
    const TENANT = "_fixture-sole-prop";

    beforeEach(() => {
      setTenantId(TENANT);
      const base = join(getTenantDir(), "data/finance");
      writeFileSync(join(base, "journal-entries.yaml"), "version: 1\nentries: []\n", "utf-8");
      writeFileSync(join(base, "period-locks.yaml"), "version: 1\nlocks: []\n", "utf-8");
      saveIngestStaging({ version: 1, batches: [], rows: [] });
      writeYamlFile(join(base, "ingest-rules.yaml"), {
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

    afterEach(() => setTenantId(TENANT));

    it("rejects unknown CoA on post (atomic — no JE)", () => {
      setTenantId(TENANT);
      const dir = join(getTenantDir(), "docs/io/inbox/card");
      mkdirSync(dir, { recursive: true });
      const file = join(dir, "bad-coa.csv");
      writeFileSync(
        file,
        `date,amount,description,payee,category
2025-06-10,1500,文具,アスクル,消耗品費
`,
        "utf-8",
      );
      writeYamlFile(join(getTenantDir(), "data/finance/ingest-rules.yaml"), {
        version: 1,
        default_cash_account_code: "1100",
        default_revenue_account_code: "4100",
        asset_intake_threshold_yen: 100000,
        rules: [
          {
            id: "bad",
            match: { contains: "文具" },
            account_code: "9999",
            tax_category: "taxable_10",
            business_pct: 100,
            priority: 10,
          },
        ],
      });
      const parsed = parseIngestFile({
        source: "card",
        filePath: "docs/io/inbox/card/bad-coa.csv",
        write: true,
      });
      classifyIngestStaging({ write: true });
      const posted = postIngestBatch({
        batchId: parsed.batch_id!,
        write: true,
        authorizedBy: "test",
      });
      expect(posted.posted).toBe(0);
      expect(posted.errors.some((e) => e.includes("9999"))).toBe(true);
      expect(loadJournalEntries().entries.filter((e) => e.source?.kind === "ingest")).toHaveLength(
        0,
      );
      if (existsSync(file)) rmSync(file);
    });

    it("marks inbox done after successful post", () => {
      setTenantId(TENANT);
      const dir = join(getTenantDir(), "docs/io/inbox/card");
      mkdirSync(dir, { recursive: true });
      const file = join(dir, "done-card.csv");
      writeFileSync(
        file,
        `date,amount,description,payee,category
2025-06-10,1500,文具,アスクル,消耗品費
`,
        "utf-8",
      );
      writeYamlFile(join(getTenantDir(), "data/document-io.yaml"), {
        inbox_items: [
          {
            id: "INB-001",
            filename: "done-card.csv",
            path: "docs/io/inbox/card/done-card.csv",
            category: "card",
            title: "done-card",
            received_at: "2025-06-10",
            source: "download",
            status: "pending",
            notes: "",
          },
        ],
        outbox_items: [],
      });
      const parsed = parseIngestFile({
        source: "card",
        filePath: "docs/io/inbox/card/done-card.csv",
        write: true,
      });
      classifyIngestStaging({ write: true });
      const posted = postIngestBatch({
        batchId: parsed.batch_id!,
        write: true,
        authorizedBy: "test",
      });
      expect(posted.errors).toEqual([]);
      expect(posted.posted).toBe(1);
      const io = YAML.parse(
        readFileSync(join(getTenantDir(), "data/document-io.yaml"), "utf-8"),
      ) as { inbox_items: Array<{ status: string }> };
      expect(io.inbox_items[0]!.status).toBe("done");
      if (existsSync(file)) rmSync(file);
    });

    it("status does not scaffold new readmes", () => {
      setTenantId(TENANT);
      const sales = join(getTenantDir(), "docs/io/inbox/sales/00-このフォルダについて.md");
      const had = existsSync(sales);
      if (had) rmSync(sales);
      runIngestStatus({});
      expect(existsSync(sales)).toBe(false);
    });

    it("dateToJournalOccurredAt uses business-day convention", () => {
      expect(dateToJournalOccurredAt("2025-06-10")).toBe("2025-06-10T03:00:00.000Z");
    });

    it("BFF payload is L1-safe (no payee/amount)", () => {
      setTenantId(TENANT);
      saveIngestStaging({
        version: 1,
        batches: [],
        rows: [
          {
            row_id: "ING-CARD-001-R001",
            fingerprint: "a".repeat(64),
            batch_id: "ING-CARD-001",
            source_kind: "card",
            occurred_on: "2025-06-10",
            direction: "outflow",
            amount_yen: 99999,
            payee: "SECRET-PAYEE",
            description: "secret",
            status: "needs_review",
            evidence_refs: ["inbox:x"],
            review_notes: ["unclassified"],
          },
        ],
      });
      const payload = buildFinanceIngestStatusPayload();
      const text = JSON.stringify(payload);
      expect(text).not.toContain("SECRET-PAYEE");
      expect(text).not.toContain("99999");
      expect(payload.needs_review[0]!.row_id).toBe("ING-CARD-001-R001");
    });
  });

  describe("corporate fixture (_fixture-books)", () => {
    const TENANT = "_fixture-books";

    beforeEach(() => {
      setTenantId(TENANT);
      saveIngestStaging({ version: 1, batches: [], rows: [] });
    });

    afterEach(() => setTenantId(TENANT));

    it("does not redirect asset band to sole-prop expense-intake", () => {
      setTenantId(TENANT);
      const coaPath = join(getTenantDir(), "data/finance/chart-of-accounts.yaml");
      expect(existsSync(coaPath)).toBe(true);
      writeYamlFile(join(getTenantDir(), "data/finance/ingest-rules.yaml"), {
        version: 1,
        default_cash_account_code: "1120",
        default_revenue_account_code: "4100",
        asset_intake_threshold_yen: 100_000,
        rules: [
          {
            id: "big",
            match: { contains: "設備" },
            account_code: "5280",
            tax_category: "taxable_10",
            business_pct: 100,
            priority: 10,
          },
        ],
      });
      // Ensure cash+expense codes exist — use whatever CoA has; 5280 may not exist on books
      const coa = YAML.parse(readFileSync(coaPath, "utf-8")) as {
        accounts: Array<{ code: string }>;
      };
      const expense =
        coa.accounts.find((a) => a.code.startsWith("5"))?.code ??
        coa.accounts[0]!.code;
      const cash =
        coa.accounts.find((a) => a.code === "1120" || a.code.startsWith("1"))?.code ??
        coa.accounts[0]!.code;
      writeYamlFile(join(getTenantDir(), "data/finance/ingest-rules.yaml"), {
        version: 1,
        default_cash_account_code: cash,
        default_revenue_account_code: "4100",
        asset_intake_threshold_yen: 100_000,
        rules: [
          {
            id: "big",
            match: { contains: "設備" },
            account_code: expense,
            tax_category: "taxable_10",
            business_pct: 100,
            priority: 10,
          },
        ],
      });
      saveIngestStaging({
        version: 1,
        batches: [
          {
            batch_id: "ING-CARD-099",
            source_kind: "card",
            file_fingerprint: "b".repeat(64),
            imported_at: new Date().toISOString(),
            logical_path: "docs/io/inbox/card/x.csv",
            row_ids: ["ING-CARD-099-R001"],
            notes: [],
          },
        ],
        rows: [
          {
            row_id: "ING-CARD-099-R001",
            fingerprint: "c".repeat(64),
            batch_id: "ING-CARD-099",
            source_kind: "card",
            occurred_on: "2025-06-10",
            direction: "outflow",
            amount_yen: 250_000,
            payee: "Vendor",
            description: "設備購入",
            account_code: expense,
            cash_account_code: cash,
            business_pct: 100,
            status: "classified",
            evidence_refs: ["inbox:x"],
            review_notes: [],
          },
        ],
      });
      const posted = postIngestBatch({
        batchId: "ING-CARD-099",
        write: true,
        authorizedBy: "test",
      });
      expect(posted.posted).toBe(0);
      expect(posted.redirected_to_intake).toContain("ING-CARD-099-R001");
      const staging = loadIngestStaging();
      const note = staging.rows[0]!.review_notes.join(" ");
      expect(note).toMatch(/fixed-asset|経理|accounting/i);
      expect(note).not.toMatch(/sole-prop-blue/);
    });

    it("rejects corporate business_pct ≠ 100", () => {
      setTenantId(TENANT);
      const coa = YAML.parse(
        readFileSync(join(getTenantDir(), "data/finance/chart-of-accounts.yaml"), "utf-8"),
      ) as { accounts: Array<{ code: string }> };
      const expense = coa.accounts.find((a) => a.code.startsWith("5"))?.code ?? coa.accounts[0]!.code;
      const cash = coa.accounts.find((a) => a.code.startsWith("1"))?.code ?? coa.accounts[0]!.code;
      saveIngestStaging({
        version: 1,
        batches: [
          {
            batch_id: "ING-CARD-098",
            source_kind: "card",
            file_fingerprint: "d".repeat(64),
            imported_at: new Date().toISOString(),
            logical_path: "docs/io/inbox/card/y.csv",
            row_ids: ["ING-CARD-098-R001"],
            notes: [],
          },
        ],
        rows: [
          {
            row_id: "ING-CARD-098-R001",
            fingerprint: "e".repeat(64),
            batch_id: "ING-CARD-098",
            source_kind: "card",
            occurred_on: "2025-06-10",
            direction: "outflow",
            amount_yen: 1000,
            payee: "X",
            description: "tea",
            account_code: expense,
            cash_account_code: cash,
            business_pct: 50,
            status: "classified",
            evidence_refs: ["inbox:y"],
            review_notes: [],
          },
        ],
      });
      const posted = postIngestBatch({
        batchId: "ING-CARD-098",
        write: true,
        authorizedBy: "test",
      });
      expect(posted.posted).toBe(0);
      expect(posted.errors.some((e) => e.includes("business_pct"))).toBe(true);
    });
  });
});
