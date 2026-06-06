import { existsSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { CURSOR_DIR, formatCurrency } from "./utils.js";

const FONT_CANDIDATES = [
  join(CURSOR_DIR, "assets/fonts/NotoSansCJKjp-Regular.otf"),
  "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
  "/Library/Fonts/Arial Unicode.ttf",
];

export function resolveJapaneseFont(): string {
  for (const path of FONT_CANDIDATES) {
    if (existsSync(path)) return path;
  }
  throw new Error(
    "Japanese font not found. Run: curl -fsSL -o cursor/assets/fonts/NotoSansCJKjp-Regular.otf " +
      "https://github.com/notofonts/noto-cjk/raw/refs/heads/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf"
  );
}

export interface PdfTableRow {
  label: string;
  amount?: number | string;
  note?: string;
  bold?: boolean;
  indent?: number;
}

type PdfDoc = InstanceType<typeof PDFDocument>;

export interface PdfWriter {
  doc: PdfDoc;
  fontPath: string;
  pageWidth: number;
  left: number;
  right: number;
  contentWidth: number;
}

export function createPdfWriter(): PdfWriter {
  const fontPath = resolveJapaneseFont();
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 56, bottom: 56, left: 56, right: 56 },
    info: { Producer: "Steward OS" },
  });
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc.font(fontPath);
  return {
    doc,
    fontPath,
    pageWidth: doc.page.width,
    left,
    right,
    contentWidth: right - left,
  };
}

export function writePdfToFile(doc: PdfDoc, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(outputPath);
    doc.pipe(stream);
    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}

function ensureSpace(w: PdfWriter, height: number): void {
  const bottom = w.doc.page.height - w.doc.page.margins.bottom;
  if (w.doc.y + height > bottom) {
    w.doc.addPage();
  }
}

export function pdfTitle(w: PdfWriter, text: string, size = 18): void {
  w.doc.fontSize(size).text(text, w.left, w.doc.y, {
    width: w.contentWidth,
    align: "center",
  });
  w.doc.moveDown(1.2);
}

export function pdfSubtitle(w: PdfWriter, text: string, size = 12): void {
  w.doc.fontSize(size).text(text, w.left, w.doc.y, {
    width: w.contentWidth,
    align: "center",
  });
  w.doc.moveDown(0.8);
}

export function pdfSection(w: PdfWriter, text: string): void {
  ensureSpace(w, 28);
  w.doc.moveDown(0.5);
  w.doc.fontSize(12).text(text, w.left, w.doc.y, { width: w.contentWidth });
  w.doc.moveDown(0.4);
}

export function pdfParagraph(w: PdfWriter, text: string, size = 10): void {
  ensureSpace(w, 40);
  w.doc.fontSize(size).text(text, w.left, w.doc.y, {
    width: w.contentWidth,
    lineGap: 4,
  });
  w.doc.moveDown(0.6);
}

export function pdfBulletList(w: PdfWriter, items: string[], size = 10): void {
  for (const item of items) {
    ensureSpace(w, 20);
    w.doc.fontSize(size).text(`・${item}`, w.left + 8, w.doc.y, {
      width: w.contentWidth - 8,
      lineGap: 3,
    });
  }
  w.doc.moveDown(0.6);
}

export function pdfTable(
  w: PdfWriter,
  rows: PdfTableRow[],
  options?: { labelWidth?: number }
): void {
  const labelWidth = options?.labelWidth ?? w.contentWidth * 0.55;
  const amountWidth = w.contentWidth - labelWidth;
  const rowHeight = 22;

  for (const row of rows) {
    ensureSpace(w, rowHeight + 4);
    const y = w.doc.y;
    const indent = (row.indent ?? 0) * 12;
    const fontSize = row.bold ? 10.5 : 10;

    w.doc.fontSize(fontSize);
    w.doc.text(row.label, w.left + indent, y, {
      width: labelWidth - indent,
      lineBreak: false,
    });

    const amountText =
      row.amount === undefined
        ? row.note ?? ""
        : typeof row.amount === "number"
          ? formatCurrency(row.amount)
          : row.amount;

    w.doc.text(amountText, w.left + labelWidth, y, {
      width: amountWidth,
      align: "right",
      lineBreak: false,
    });

    if (row.note && row.amount !== undefined) {
      w.doc.fontSize(8).fillColor("#555555").text(row.note, w.left + indent, y + 14, {
        width: labelWidth - indent,
      });
      w.doc.fillColor("#000000");
      w.doc.y = y + rowHeight + (row.note ? 6 : 0);
    } else {
      w.doc.y = y + rowHeight;
    }
  }
  w.doc.moveDown(0.4);
}

export function pdfMetaBlock(
  w: PdfWriter,
  lines: { label: string; value: string }[]
): void {
  for (const line of lines) {
    ensureSpace(w, 18);
    w.doc.fontSize(10).text(`${line.label}　${line.value}`, w.left, w.doc.y, {
      width: w.contentWidth,
    });
  }
  w.doc.moveDown(0.8);
}

export function pdfSignatureBlock(
  w: PdfWriter,
  date: string,
  companyName: string,
  representatives: string[]
): void {
  ensureSpace(w, 120);
  w.doc.moveDown(1);
  pdfParagraph(w, date, 10);
  pdfParagraph(w, companyName, 11);
  for (const rep of representatives) {
    pdfParagraph(w, rep, 10);
  }
}

export function fiscalPeriodLabel(from: string, to: string): string {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return `${fy}年${fm}月1日から${ty}年${tm}月31日まで`;
}

export function fiscalYearNumber(establishedDate: string | undefined, periodTo: string): number {
  if (!establishedDate) return 1;
  const [ey] = establishedDate.split("-").map(Number);
  const [ty, tm] = periodTo.split("-").map(Number);
  const endYear = tm === 1 ? ty - 1 : ty;
  return Math.max(1, endYear - ey + 1);
}
