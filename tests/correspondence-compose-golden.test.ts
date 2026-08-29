/**
 * Golden regression for engineering 100-point mail compose / claims / knowledge.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import {
  assertCorrespondenceClaims,
  assertDatesAgainstClaims,
  assertAmountsRequireVerifiedClaims,
  CorrespondenceClaimsError,
  extractAmounts,
} from "../src/lib/correspondence/claims-assert.js";
import {
  buildDeterministicComposeReply,
  sanitizeComposeBody,
} from "../src/lib/correspondence/compose.js";
import type { CorrespondenceClaim } from "../src/lib/correspondence/facts-verify.js";
import {
  isAttachmentPathAllowlisted,
  searchCorrespondenceKnowledge,
} from "../src/lib/correspondence/knowledge-search.js";

function cleanup(): void {
  for (const p of [
    join(getDocsDir(), "product"),
    join(getDataDir(), "sales"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("correspondence compose golden (100-point)", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
  });
  afterEach(() => cleanup());

  it("deterministic fallback body is stable (golden)", () => {
    const claims: CorrespondenceClaim[] = [
      {
        id: "recipient:primary",
        kind: "recipient",
        label: "宛先",
        value: "partner@example.com",
        source: "test",
        verified: true,
      },
      {
        id: "case:status",
        kind: "status",
        label: "案件",
        value: "triaged",
        source: "INQ-1",
        verified: true,
      },
    ];
    const reply = buildDeterministicComposeReply({
      subject: "製品について",
      claims,
      knowledge: [{ path: "docs/product/overview.md", excerpt: "概要" }],
    });
    expect(reply.subject).toBe("Re: 製品について");
    expect(reply.body).toBe(
      [
        "partner@example.com 様",
        "",
        "お世話になっております。",
        "",
        "ご連絡ありがとうございます。内容を確認のうえ、改めてご連絡いたします。",
        "参考資料: docs/product/overview.md",
        "",
        "何卒よろしくお願い申し上げます。",
      ].join("\n"),
    );
    expect(reply.attachment_refs).toEqual(["docs/product/overview.md"]);
    expect(reply.body).not.toMatch(/在庫|納期|円|¥/);
  });

  it("sanitizeComposeBody strips invented fulfillment and amounts", () => {
    const claims: CorrespondenceClaim[] = [
      {
        id: "delivery:1",
        kind: "delivery",
        label: "納期",
        value: "2026-09-15",
        source: "INQ",
        verified: true,
      },
    ];
    const raw = [
      "ご担当者様",
      "",
      "在庫は十分です。",
      "納期は 2026-09-15 です。",
      "お見積は 999,999 円です。",
      "よろしくお願いいたします。",
    ].join("\n");
    const cleaned = sanitizeComposeBody(raw, claims);
    expect(cleaned).not.toMatch(/在庫/);
    expect(cleaned).toMatch(/納期は 2026-09-15/);
    expect(cleaned).not.toMatch(/999/);
  });

  it("extractAmounts ignores bare ids and years", () => {
    expect(extractAmounts("MSG-20260828 の件")).toEqual([]);
    expect(extractAmounts("年は 2026 です")).toEqual([]);
    expect(extractAmounts("お見積は 500,000 円です")).toEqual(["500000"]);
    expect(extractAmounts("価格は ¥12000")).toEqual(["12000"]);
    expect(extractAmounts("１００万円のご提示")).toEqual(["100"]);
  });

  it("rejects Japanese date that does not match delivery claim", () => {
    const claims: CorrespondenceClaim[] = [
      {
        id: "delivery:1",
        kind: "delivery",
        label: "納期",
        value: "2026-09-15",
        source: "INQ",
        verified: true,
      },
    ];
    expect(() =>
      assertDatesAgainstClaims("納期は 10月1日 です。", claims),
    ).toThrow(CorrespondenceClaimsError);
    expect(() =>
      assertDatesAgainstClaims("納期は 9月15日 です。", claims),
    ).not.toThrow();
  });

  it("amount band claims accept endpoint values", () => {
    const claims: CorrespondenceClaim[] = [
      {
        id: "a",
        kind: "amount",
        label: "band",
        value: "100-200",
        source: "deal",
        verified: true,
      },
    ];
    expect(() => assertAmountsRequireVerifiedClaims("ご提示は 100 万円です。", claims)).not.toThrow();
    expect(() => assertAmountsRequireVerifiedClaims("ご提示は 999 万円です。", claims)).toThrow(
      /一致しません|金額/,
    );
  });

  it("knowledge search: empty query, nested md, L2 reject, quotes", () => {
    expect(searchCorrespondenceKnowledge("")).toEqual([]);
    expect(searchCorrespondenceKnowledge("a")).toEqual([]);

    const nested = join(getDocsDir(), "product", "guides");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "setup.md"), "# Setup\n製品セットアップ手順\n", "utf-8");

    const hits = searchCorrespondenceKnowledge("セットアップ 製品");
    expect(hits.some((h) => h.path.includes("docs/product/guides/setup.md"))).toBe(true);

    expect(isAttachmentPathAllowlisted("records/vault/secret.md")).toBe(false);
    expect(isAttachmentPathAllowlisted("docs/product/guides/setup.md")).toBe(true);

    mkdirSync(join(getDataDir(), "sales"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "sales", "quotes.yaml"),
      YAML.stringify({
        version: 1,
        quotes: [
          {
            id: "QUOTE-2026-099",
            deal_id: "DEAL-2026-099",
            account_id: "CUST-2026-099",
            status: "accepted",
            amount_band: "10-20",
            notes: "標準価格表",
          },
        ],
      }),
      "utf-8",
    );
    const quoteHits = searchCorrespondenceKnowledge("見積");
    expect(quoteHits.some((h) => String(h.title).includes("QUOTE-2026-099"))).toBe(true);
  });
});
