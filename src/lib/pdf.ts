import { existsSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { ASSETS_DIR, formatCurrency } from "./utils.js";

/** Print palette — oorgos.org 系のインク／アクセント（印刷向け） */
export const PDF_THEME = {
  ink: "#1d1d1f",
  muted: "#6e6e73",
  rule: "#d2d2d7",
  accent: "#0071e3",
  soft: "#f5f5f7",
} as const;

const FONT_CANDIDATES = [
  join(ASSETS_DIR, "fonts/NotoSansCJKjp-Regular.otf"),
  "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
  "/Library/Fonts/Arial Unicode.ttf",
];

export function resolveJapaneseFont(): string {
  for (const path of FONT_CANDIDATES) {
    if (existsSync(path)) return path;
  }
  throw new Error(
    "Japanese font not found. Run: curl -fsSL -o assets/fonts/NotoSansCJKjp-Regular.otf " +
      "https://github.com/notofonts/noto-cjk/raw/refs/heads/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf"
  );
}

export interface PdfTableRow {
  label: string;
  amount?: number | string;
  /** Prior-period column (comparative BS/PL). */
  priorAmount?: number | string;
  note?: string;
  bold?: boolean;
  indent?: number;
  /** section header / total / divider */
  variant?: "section" | "total" | "emphasis" | "muted";
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
    margins: { top: 48, bottom: 52, left: 52, right: 52 },
    info: { Producer: "OrgOS", Creator: "OpenOrgOS" },
  });
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc.font(fontPath);
  doc.fillColor(PDF_THEME.ink);
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
    w.doc.fillColor(PDF_THEME.ink);
  }
}

function drawHairline(w: PdfWriter, y?: number, color = PDF_THEME.rule): void {
  const lineY = y ?? w.doc.y;
  w.doc
    .strokeColor(color)
    .lineWidth(0.6)
    .moveTo(w.left, lineY)
    .lineTo(w.right, lineY)
    .stroke();
  w.doc.strokeColor(PDF_THEME.ink);
}

/** Cover-style document title with accent bar */
export function pdfCoverHeader(
  w: PdfWriter,
  title: string,
  subtitle?: string
): void {
  const y0 = w.doc.y;

  w.doc
    .rect(w.left, y0, 3.5, subtitle ? 52 : 36)
    .fill(PDF_THEME.accent);

  w.doc
    .fillColor(PDF_THEME.ink)
    .fontSize(22)
    .text(title, w.left + 16, y0, {
      width: w.contentWidth - 16,
      align: "left",
      characterSpacing: 2,
    });

  if (subtitle) {
    w.doc
      .fillColor(PDF_THEME.muted)
      .fontSize(10)
      .text(subtitle, w.left + 16, y0 + 30, {
        width: w.contentWidth - 16,
        align: "left",
      });
  }

  w.doc.y = y0 + (subtitle ? 56 : 40);
  drawHairline(w, w.doc.y, PDF_THEME.rule);
  w.doc.y += 14;
  w.doc.fillColor(PDF_THEME.ink);
}

/** @deprecated prefer pdfCoverHeader for new reports */
export function pdfTitle(w: PdfWriter, text: string, size = 18): void {
  pdfCoverHeader(w, text);
  void size;
}

export function pdfSubtitle(w: PdfWriter, text: string, size = 11): void {
  w.doc
    .fillColor(PDF_THEME.muted)
    .fontSize(size)
    .text(text, w.left, w.doc.y, {
      width: w.contentWidth,
      align: "left",
    });
  w.doc.moveDown(0.6);
  w.doc.fillColor(PDF_THEME.ink);
}

export function pdfSection(w: PdfWriter, text: string): void {
  ensureSpace(w, 36);
  w.doc.moveDown(0.55);
  const y = w.doc.y;

  w.doc
    .rect(w.left, y + 2, 2.5, 12)
    .fill(PDF_THEME.accent);

  w.doc
    .fillColor(PDF_THEME.ink)
    .fontSize(11)
    .text(text, w.left + 10, y, { width: w.contentWidth - 10 });

  w.doc.y = y + 16;
  drawHairline(w, w.doc.y, PDF_THEME.rule);
  w.doc.y += 10;
}

export function pdfParagraph(w: PdfWriter, text: string, size = 10): void {
  ensureSpace(w, 36);
  w.doc
    .fillColor(PDF_THEME.ink)
    .fontSize(size)
    .text(text, w.left, w.doc.y, {
      width: w.contentWidth,
      lineGap: 3.5,
      align: "justify",
    });
  w.doc.moveDown(0.55);
}

export function pdfMutedNote(w: PdfWriter, text: string): void {
  ensureSpace(w, 28);
  w.doc
    .fillColor(PDF_THEME.muted)
    .fontSize(8.5)
    .text(text, w.left, w.doc.y, {
      width: w.contentWidth,
      lineGap: 2.5,
    });
  w.doc.moveDown(0.45);
  w.doc.fillColor(PDF_THEME.ink);
}

export function pdfBulletList(w: PdfWriter, items: string[], size = 10): void {
  for (const item of items) {
    ensureSpace(w, 18);
    const y = w.doc.y;
    w.doc
      .circle(w.left + 4, y + 5, 1.4)
      .fill(PDF_THEME.accent);
    w.doc
      .fillColor(PDF_THEME.ink)
      .fontSize(size)
      .text(item, w.left + 12, y, {
        width: w.contentWidth - 12,
        lineGap: 2.5,
      });
  }
  w.doc.moveDown(0.45);
}

export function pdfTable(
  w: PdfWriter,
  rows: PdfTableRow[],
  options?: { labelWidth?: number }
): void {
  const comparative = rows.some((row) => row.priorAmount !== undefined);
  const labelWidth =
    options?.labelWidth ?? w.contentWidth * (comparative ? 0.46 : 0.58);
  const amountWidth = comparative
    ? (w.contentWidth - labelWidth) / 2
    : w.contentWidth - labelWidth;

  for (const row of rows) {
    const isSection = row.variant === "section" || (row.bold && row.amount === "");
    const isTotal =
      row.variant === "total" ||
      row.variant === "emphasis" ||
      (row.bold && row.amount !== undefined && row.amount !== "");
    const rowHeight = isSection ? 26 : row.note ? 28 : 20;

    ensureSpace(w, rowHeight + 2);
    const y = w.doc.y;
    const indent = (row.indent ?? 0) * 14;

    if (isSection) {
      w.doc.y = y + 4;
      w.doc
        .fillColor(PDF_THEME.muted)
        .fontSize(9)
        .text(row.label, w.left, w.doc.y, { width: w.contentWidth });
      w.doc.y = y + 18;
      continue;
    }

    if (isTotal) {
      drawHairline(w, y, PDF_THEME.rule);
    }

    const fontSize = isTotal ? 10.5 : 9.5;
    const labelColor =
      row.variant === "muted" || (row.indent ?? 0) > 0
        ? PDF_THEME.muted
        : PDF_THEME.ink;
    const textY = isTotal ? y + 5 : y + 3;

    w.doc.fillColor(labelColor).fontSize(fontSize);
    w.doc.text(row.label, w.left + indent, textY, {
      width: labelWidth - indent,
      lineBreak: false,
    });

    const formatCell = (value: number | string | undefined): string => {
      if (value === undefined) return "";
      return typeof value === "number" ? formatCurrency(value) : value;
    };

    const amountText =
      row.amount === undefined ? row.note ?? "" : formatCell(row.amount);

    w.doc
      .fillColor(PDF_THEME.ink)
      .fontSize(fontSize)
      .text(amountText, w.left + labelWidth, textY, {
        width: amountWidth,
        align: "right",
        lineBreak: false,
      });

    if (comparative) {
      w.doc
        .fillColor(PDF_THEME.muted)
        .fontSize(fontSize)
        .text(formatCell(row.priorAmount), w.left + labelWidth + amountWidth, textY, {
          width: amountWidth,
          align: "right",
          lineBreak: false,
        });
    }

    if (row.note && row.amount !== undefined) {
      w.doc
        .fillColor(PDF_THEME.muted)
        .fontSize(7.5)
        .text(row.note, w.left + indent, y + 16, {
          width: labelWidth - indent,
        });
      w.doc.y = y + rowHeight;
    } else {
      w.doc.y = y + (isTotal ? 22 : 18);
    }

    w.doc.fillColor(PDF_THEME.ink);
  }
  w.doc.moveDown(0.35);
}

export function pdfMetaBlock(
  w: PdfWriter,
  lines: { label: string; value: string }[]
): void {
  const labelCol = Math.min(88, w.contentWidth * 0.22);

  for (const line of lines) {
    ensureSpace(w, 18);
    const y = w.doc.y;
    w.doc
      .fillColor(PDF_THEME.muted)
      .fontSize(8.5)
      .text(line.label, w.left, y, { width: labelCol, lineBreak: false });
    w.doc
      .fillColor(PDF_THEME.ink)
      .fontSize(10)
      .text(line.value, w.left + labelCol, y - 1, {
        width: w.contentWidth - labelCol,
        lineBreak: false,
      });
    w.doc.y = y + 16;
  }

  w.doc.y += 4;
  drawHairline(w);
  w.doc.y += 12;
  w.doc.fillColor(PDF_THEME.ink);
}

/** KPI strip — three compact figures */
export function pdfStatRow(
  w: PdfWriter,
  stats: { label: string; value: string }[]
): void {
  ensureSpace(w, 48);
  const gap = 10;
  const n = Math.max(stats.length, 1);
  const cellW = (w.contentWidth - gap * (n - 1)) / n;
  const y = w.doc.y;

  stats.forEach((stat, i) => {
    const x = w.left + i * (cellW + gap);
    w.doc.rect(x, y, cellW, 42).fill(PDF_THEME.soft);
    w.doc
      .fillColor(PDF_THEME.muted)
      .fontSize(7.5)
      .text(stat.label, x + 10, y + 9, { width: cellW - 20 });
    w.doc
      .fillColor(PDF_THEME.ink)
      .fontSize(12)
      .text(stat.value, x + 10, y + 22, { width: cellW - 20 });
  });

  w.doc.y = y + 52;
  w.doc.fillColor(PDF_THEME.ink);
}

export function pdfSignatureBlock(
  w: PdfWriter,
  date: string,
  companyName: string,
  representatives: string[]
): void {
  ensureSpace(w, 130);
  w.doc.moveDown(1.2);
  drawHairline(w);
  w.doc.y += 14;

  const blockWidth = w.contentWidth * 0.48;
  const x = w.right - blockWidth;

  w.doc
    .fillColor(PDF_THEME.muted)
    .fontSize(9)
    .text(date, x, w.doc.y, { width: blockWidth, align: "right" });
  w.doc.moveDown(0.7);
  w.doc
    .fillColor(PDF_THEME.ink)
    .fontSize(11)
    .text(companyName, x, w.doc.y, { width: blockWidth, align: "right" });
  w.doc.moveDown(0.9);

  for (const rep of representatives) {
    ensureSpace(w, 22);
    w.doc
      .fillColor(PDF_THEME.ink)
      .fontSize(10)
      .text(rep, x, w.doc.y, { width: blockWidth, align: "right" });
    w.doc.moveDown(0.55);
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
