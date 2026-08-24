import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { PassThrough } from "node:stream";
import type { SignedReceiptQrPayload } from "../../schemas/receipt-qr.js";
import {
  createPdfWriter,
  pdfMetaBlock,
  pdfParagraph,
  pdfSection,
  pdfTable,
  pdfTitle,
  writePdfToFile,
  type PdfTableRow,
  type PdfWriter,
} from "./pdf.js";
import { encodeReceiptLink, receiptPortalUrl } from "./receipt-qr.js";
import { renderReceiptQrPng } from "./receipt-qr-render.js";
import { formatCurrency } from "./utils.js";

function documentTypeLabel(
  documentType: SignedReceiptQrPayload["receipt"]["document_type"],
): string {
  return documentType === "qualified_invoice"
    ? "適格請求書"
    : "適格簡易請求書";
}

function formatTransactionDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

async function paintReceiptPdf(
  w: PdfWriter,
  payload: SignedReceiptQrPayload,
  options: { portalUrl?: string } = {},
): Promise<void> {
  const receipt = payload.receipt;
  const portalUrl = options.portalUrl ?? receiptPortalUrl();
  const link = encodeReceiptLink(payload, portalUrl);
  const qrPng = await renderReceiptQrPng(link, 180);

  pdfTitle(w, documentTypeLabel(receipt.document_type), 18);
  w.doc.moveDown(0.3);

  pdfMetaBlock(w, [
    { label: "領収書番号", value: receipt.receipt_id },
    { label: "発行日時", value: receipt.issued_at },
    { label: "取引日", value: formatTransactionDate(receipt.transaction_date) },
    { label: "digest", value: `${payload.digest.slice(0, 16)}…` },
  ]);

  if (receipt.document_type === "qualified_invoice" && receipt.recipient_name) {
    pdfSection(w, "宛名");
    pdfParagraph(w, `${receipt.recipient_name}　御中`, 11);
  }

  pdfSection(w, "発行者");
  pdfParagraph(w, receipt.issuer.name, 11);
  pdfParagraph(
    w,
    `登録番号: ${receipt.issuer.invoice_registration_number}`,
    10,
  );
  pdfParagraph(w, `組織ID: ${receipt.issuer.org_id}`, 9);

  pdfSection(w, "明細");
  const lineRows: PdfTableRow[] = receipt.lines.map((line) => ({
    label: `${line.description}${line.quantity != null ? ` ×${line.quantity}` : ""}（${line.tax_rate}%${line.reduced_tax ? " 軽減" : ""}）`,
    amount: line.amount_including_tax,
    note: `税抜 ${formatCurrency(line.amount_excluding_tax)} / 税額 ${formatCurrency(line.tax_amount)}`,
  }));
  pdfTable(w, lineRows);

  pdfSection(w, "税率別合計");
  const taxRows: PdfTableRow[] = receipt.tax_totals.map((total) => ({
    label: `${total.tax_rate}%`,
    amount: total.amount_including_tax,
    note: `税抜 ${formatCurrency(total.amount_excluding_tax)} / 税額 ${formatCurrency(total.tax_amount)}`,
  }));
  taxRows.push({
    label: "合計（税込）",
    amount: receipt.total_amount,
    bold: true,
  });
  pdfTable(w, taxRows);

  pdfSection(w, "検証用 QR");
  pdfParagraph(
    w,
    "スマートフォン等で読み取り、署名を検証できます（金額・明細はリンク内に含まれます）。",
    9,
  );
  const qrSize = 120;
  const qrX = w.left;
  const qrY = w.doc.y;
  w.doc.image(qrPng, qrX, qrY, { width: qrSize, height: qrSize });
  w.doc.y = qrY + qrSize + 8;
  pdfParagraph(w, link.length > 120 ? `${link.slice(0, 117)}…` : link, 7);
}

/**
 * Build a JP qualified invoice / simplified invoice PDF with embedded QR.
 * Returns absolute output path.
 */
export async function generateReceiptPdf(
  payload: SignedReceiptQrPayload,
  outputPath: string,
  options: { portalUrl?: string } = {},
): Promise<string> {
  const w = createPdfWriter();
  await paintReceiptPdf(w, payload, options);
  mkdirSync(dirname(outputPath), { recursive: true });
  await writePdfToFile(w.doc, outputPath);
  return outputPath;
}

/** In-memory PDF buffer (for HTTP streaming). */
export async function generateReceiptPdfBuffer(
  payload: SignedReceiptQrPayload,
  options: { portalUrl?: string } = {},
): Promise<Buffer> {
  const w = createPdfWriter();
  await paintReceiptPdf(w, payload, options);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = new PassThrough();
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    w.doc.pipe(stream);
    w.doc.end();
  });
}
