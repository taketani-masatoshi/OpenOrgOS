import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { signReceiptForTests } from "../src/lib/receipt-qr.js";
import { generateReceiptPdf } from "../src/lib/receipt-pdf.js";
import type { ReceiptQrData } from "../schemas/receipt-qr.js";
import { existsSync, statSync } from "node:fs";

const receipt: ReceiptQrData = {
  schema: "orgos.jp.receipt.v1",
  receipt_id: "RCPT-20260727-099",
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
      description: "会議費",
      tax_rate: 10,
      reduced_tax: false,
      amount_excluding_tax: 5000,
      tax_amount: 500,
      amount_including_tax: 5500,
    },
  ],
  tax_totals: [
    {
      tax_rate: 10,
      amount_excluding_tax: 5000,
      tax_amount: 500,
      amount_including_tax: 5500,
    },
  ],
  total_amount: 5500,
  claim: {
    endpoint: "https://example.test/wire/v1/receipts/claim",
    claim_key: "p".repeat(32),
  },
};

describe("receipt-pdf", () => {
  it("generates a PDF with embedded QR", async () => {
    const dir = mkdtempSync(join(tmpdir(), "receipt-pdf-"));
    const out = join(dir, "out.pdf");
    const payload = signReceiptForTests(receipt);
    await generateReceiptPdf(payload, out, {
      portalUrl: "https://receipt.oorgos.org/r",
    });
    expect(existsSync(out)).toBe(true);
    expect(statSync(out).size).toBeGreaterThan(1000);
    rmSync(dir, { recursive: true, force: true });
  });
});
