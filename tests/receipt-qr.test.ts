import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import {
  decodeReceiptLink,
  encodeReceiptLink,
  forbiddenAmountFieldInReceiptClaimPayload,
  receiptDigest,
  signReceiptForTests,
  verifySignedReceiptPayload,
} from "../src/lib/receipt-qr.js";
import { renderReceiptQrSvg, renderReceiptQrPng } from "../src/lib/receipt-qr-render.js";
import { canonicalJson } from "../src/lib/protocol/canonical.js";
import type { ReceiptQrData } from "../schemas/receipt-qr.js";

function sampleReceipt(overrides: Partial<ReceiptQrData> = {}): ReceiptQrData {
  return {
    schema: "orgos.jp.receipt.v1",
    receipt_id: "RCPT-20260727-001",
    document_type: "qualified_invoice",
    issued_at: "2026-07-27T03:00:00.000Z",
    transaction_date: "2026-07-26",
    currency: "JPY",
    issuer: {
      org_id: "org:test",
      name: "テスト商事",
      invoice_registration_number: "T1234567890123",
    },
    recipient_name: "株式会社サンプル",
    lines: [
      {
        description: "事務用品",
        quantity: 1,
        tax_rate: 10,
        reduced_tax: false,
        amount_excluding_tax: 1000,
        tax_amount: 100,
        amount_including_tax: 1100,
      },
    ],
    tax_totals: [
      {
        tax_rate: 10,
        amount_excluding_tax: 1000,
        tax_amount: 100,
        amount_including_tax: 1100,
      },
    ],
    total_amount: 1100,
    claim: {
      endpoint: "https://example.test/wire/v1/receipts/claim",
      claim_key: "k".repeat(32),
    },
    ...overrides,
  };
}

describe("receipt-qr", () => {
  it("signs and verifies a receipt payload", () => {
    const payload = signReceiptForTests(sampleReceipt());
    const verified = verifySignedReceiptPayload(payload);
    expect(verified.ok).toBe(true);
    expect(verified.payload?.digest).toBe(receiptDigest(payload.receipt));
  });

  it("round-trips encode/decode v2z link", () => {
    const payload = signReceiptForTests(sampleReceipt());
    const link = encodeReceiptLink(payload, "https://receipt.oorgos.org/r");
    expect(link.startsWith("https://receipt.oorgos.org/r#v2z.")).toBe(true);
    const decoded = decodeReceiptLink(link);
    const verified = verifySignedReceiptPayload(decoded);
    expect(verified.ok).toBe(true);
    expect(decoded.receipt.receipt_id).toBe("RCPT-20260727-001");
    expect(decoded.receipt.total_amount).toBe(1100);
    expect(decoded.receipt.claim?.claim_key).toBe("k".repeat(32));
  });

  it("detects tampering via digest mismatch", () => {
    const payload = signReceiptForTests(sampleReceipt());
    const tampered = {
      ...payload,
      receipt: {
        ...payload.receipt,
        total_amount: 9999,
      },
    };
    const verified = verifySignedReceiptPayload(tampered);
    expect(verified.ok).toBe(false);
    expect(verified.reason).toBe("digest_mismatch");
  });

  it("renders QR svg and png for a short link", async () => {
    const payload = signReceiptForTests(sampleReceipt());
    const link = encodeReceiptLink(payload);
    const svg = await renderReceiptQrSvg(link);
    expect(svg).toContain("<svg");
    const png = await renderReceiptQrPng(link, 128);
    expect(png.byteLength).toBeGreaterThan(100);
  });

  it("writes fixture vectors for the public verify portal", () => {
    const payload = signReceiptForTests(sampleReceipt());
    const link = encodeReceiptLink(payload, "https://receipt.oorgos.org/r");
    const dir = mkdtempSync(join(tmpdir(), "receipt-qr-vectors-"));
    const path = join(dir, "receipt-qr-vectors.json");
    writeFileSync(
      path,
      JSON.stringify(
        {
          schema: "orgos.jp.receipt.test-vector.v1",
          canonical_json_sample: canonicalJson(payload.receipt),
          digest: payload.digest,
          link,
          payload,
        },
        null,
        2,
      ),
    );
    expect(path).toContain("receipt-qr-vectors");
    rmSync(dir, { recursive: true, force: true });
  });

  it("previews without config.yaml using defaults (no persist)", async () => {
    const { setTenantId } = await import("../src/lib/tenant.js");
    const { issueReceipt, loadReceiptConfigOrDefault } = await import(
      "../src/lib/receipt-qr.js"
    );
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { getDataDir } = await import("../src/lib/utils.js");

    setTenantId("mal");
    const configPath = join(getDataDir(), "receipt-qr", "config.yaml");
    // May or may not exist on mal; preview must not require it.
    expect(loadReceiptConfigOrDefault().claim_base_url).toContain(
      "/wire/v1/receipts/claim",
    );

    const result = issueReceipt(
      {
        document_type: "qualified_simplified_invoice",
        transaction_date: "2026-07-27",
        lines: [
          {
            description: "商品A",
            tax_rate: 10,
            amount_excluding_tax: 333,
            tax_amount: 33,
            amount_including_tax: 366,
          },
          {
            description: "商品B",
            tax_rate: 10,
            amount_excluding_tax: 333,
            tax_amount: 33,
            amount_including_tax: 366,
          },
        ],
        claim_endpoint: "http://127.0.0.1:8787/wire/v1/receipts/claim",
      },
      { persist: false },
    );
    expect(result.stored.receipt.issuer.name).toBe("株式会社MAL");
    expect(result.stored.receipt.issuer.invoice_registration_number).toBe(
      "T4010001189530",
    );
    expect(result.stored.receipt.total_amount).toBe(732);
    // Preview must not create config as a side effect when missing.
    if (!existsSync(configPath)) {
      expect(existsSync(join(getDataDir(), "receipt-qr", "registry.json"))).toBe(
        false,
      );
    }
  });

  it("resolves issuer from corporate_number (ignores client override)", async () => {
    const { setTenantId } = await import("../src/lib/tenant.js");
    const {
      issueReceipt,
      resolveReceiptIssuerIdentity,
    } = await import("../src/lib/receipt-qr.js");
    setTenantId("mal");
    const issuer = resolveReceiptIssuerIdentity();
    expect(issuer.corporate_number).toBe("4010001189530");
    expect(issuer.invoice_registration_number).toBe("T4010001189530");

    const result = issueReceipt(
      {
        document_type: "qualified_simplified_invoice",
        transaction_date: "2026-07-27",
        issuer_name: "偽の会社名",
        invoice_registration_number: "T9999999999999",
        lines: [
          {
            description: "A",
            tax_rate: 10,
            amount_excluding_tax: 1000,
            tax_amount: 100,
            amount_including_tax: 1100,
          },
        ],
        claim_endpoint: "http://127.0.0.1:8787/wire/v1/receipts/claim",
      },
      { persist: false },
    );
    expect(result.stored.receipt.issuer.name).toBe(issuer.issuer_name);
    expect(result.stored.receipt.issuer.invoice_registration_number).toBe(
      issuer.invoice_registration_number,
    );
  });

  it("rejects multi-line tax that was rounded per line instead of once per rate", async () => {
    const { setTenantId } = await import("../src/lib/tenant.js");
    const { issueReceipt } = await import("../src/lib/receipt-qr.js");
    setTenantId("mal");
    expect(() =>
      issueReceipt(
        {
          document_type: "qualified_simplified_invoice",
          transaction_date: "2026-07-27",
          lines: [
            {
              description: "A",
              tax_rate: 10,
              amount_excluding_tax: 15,
              tax_amount: 1,
              amount_including_tax: 16,
            },
            {
              description: "B",
              tax_rate: 10,
              amount_excluding_tax: 15,
              tax_amount: 1,
              amount_including_tax: 16,
            },
          ],
          claim_endpoint: "http://127.0.0.1:8787/wire/v1/receipts/claim",
        },
        { persist: false },
      ),
    ).toThrow(/rounded once per rate/);
  });
});

describe("ADR 0032 amount-free claim payload", () => {
  it("allows only receipt_id / digest / claim_key", () => {
    expect(
      forbiddenAmountFieldInReceiptClaimPayload({
        receipt_id: "RCPT-1",
        receipt_digest: "a".repeat(64),
        claim_key: "k".repeat(32),
      }),
    ).toBeNull();
  });

  it("flags total_amount and lines on inbound payload", () => {
    expect(
      forbiddenAmountFieldInReceiptClaimPayload({
        receipt_id: "RCPT-1",
        total_amount: 1100,
      }),
    ).toBe("total_amount");
    expect(
      forbiddenAmountFieldInReceiptClaimPayload({
        receipt_id: "RCPT-1",
        lines: [],
      }),
    ).toBe("lines");
  });
});
