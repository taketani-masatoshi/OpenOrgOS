import { describe, expect, it } from "vitest";
import { parseCsvLine, parseYenAmount } from "../src/lib/finance/ingest/csv.js";
import { parseIngestSource, rowFingerprint, assertNotPdf } from "../src/lib/finance/ingest/adapters/index.js";
import { pickRule } from "../src/lib/finance/ingest/classify.js";
import { ingestRulesFileSchema } from "../schemas/finance/ingest.js";

describe("ingest csv", () => {
  it("parses quoted commas", () => {
    expect(parseCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
  });
  it("parses yen amounts", () => {
    expect(parseYenAmount("¥1,234")).toBe(1234);
  });
});

describe("ingest adapters", () => {
  it("rejects pdf", () => {
    expect(() => assertNotPdf("foo.pdf")).toThrow(/PDF/);
  });

  it("parses card csv", () => {
    const csv = `date,amount,description,payee,category
2025-01-20,2180,コーヒー,スターバックス,接待交際費
`;
    const r = parseIngestSource("card", csv, "card.csv");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.amount_yen).toBe(2180);
    expect(r.rows[0]!.direction).toBe("outflow");
  });

  it("parses receipt md", () => {
    const md = `# 領収書
- date: 2025-01-12
- amount: 3300
- payee: NTTドコモ
- description: 携帯
`;
    const r = parseIngestSource("receipts", md, "receipt.md");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.payee).toContain("ドコモ");
  });

  it("fingerprints stably", () => {
    const a = rowFingerprint({
      source_kind: "card",
      occurred_on: "2025-01-01",
      direction: "outflow",
      amount_yen: 100,
      payee: "A",
      description: "x",
      logical_path: "docs/io/inbox/card/a.csv",
    });
    const b = rowFingerprint({
      source_kind: "card",
      occurred_on: "2025-01-01",
      direction: "outflow",
      amount_yen: 100,
      payee: "A",
      description: "x",
      logical_path: "docs/io/inbox/card/a.csv",
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("ingest classify rules", () => {
  it("matches contains rule", () => {
    const rules = ingestRulesFileSchema.parse({
      version: 1,
      rules: [
        {
          id: "docomo",
          match: { contains: "ドコモ" },
          account_code: "5150",
          priority: 10,
        },
      ],
    });
    const rule = pickRule(rules, {
      row_id: "r1",
      fingerprint: "a".repeat(64),
      batch_id: "b1",
      source_kind: "receipts",
      occurred_on: "2025-01-01",
      direction: "outflow",
      amount_yen: 1000,
      payee: "NTTドコモ",
      description: "携帯",
      status: "parsed",
      evidence_refs: ["inbox:x"],
      review_notes: [],
    });
    expect(rule?.account_code).toBe("5150");
  });
});
