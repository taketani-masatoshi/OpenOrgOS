import {
  createPdfWriter,
  pdfMetaBlock,
  pdfParagraph,
  pdfSection,
  pdfTable,
  pdfTitle,
  writePdfToFile,
  type PdfTableRow,
} from "./pdf.js";
import { formatCurrency } from "./utils.js";
import type { InvoiceTemplate } from "../../schemas/invoice-template.js";
import {
  billingMonthEndDate,
  formatJapaneseDate,
  formatJapaneseYearMonth,
  invoiceNumber,
  paymentDueDate,
} from "./invoice-dates.js";

export interface RentInvoiceInput {
  billingMonth: string;
  monthlyRent: number;
  tenantName: string;
  propertyName: string;
  propertyLocation: string;
  companyName: string;
  companyAddress: string;
  invoiceRegistrationNumber: string;
  bankAccount: string;
  invoiceNumberPrefix?: string;
  template?: InvoiceTemplate;
}

export function companyInvoiceRegistrationNumber(corporateNumber?: string): string {
  if (!corporateNumber) return "TBD";
  return corporateNumber.startsWith("T") ? corporateNumber : `T${corporateNumber}`;
}

export function buildRentInvoiceRows(input: RentInvoiceInput): PdfTableRow[] {
  const tpl = input.template?.pdf;
  const lineLabel =
    tpl?.line_label
      ?.replace("{year_month}", formatJapaneseYearMonth(input.billingMonth))
      .replace("{property_name}", input.propertyName) ??
    `${formatJapaneseYearMonth(input.billingMonth)}分 賃料（${input.propertyName}）`;
  const lineNote =
    tpl?.line_note ??
    "貸付用家屋の賃貸料（消費税非課税の可能性あり・要税理士確認）";
  const taxLabel = tpl?.tax_label ?? "消費税（10%）";
  const taxNote = tpl?.tax_note ?? "貸付用家屋の賃貸料は原則非課税";

  return [
    {
      label: lineLabel,
      amount: input.monthlyRent,
      note: lineNote,
    },
    { label: "小計", amount: input.monthlyRent, bold: true },
    { label: taxLabel, amount: "非課税", note: taxNote },
    { label: "請求合計", amount: input.monthlyRent, bold: true },
  ];
}

export async function generateRentInvoicePdf(
  input: RentInvoiceInput,
  outputPath: string
): Promise<string> {
  const w = createPdfWriter();
  const issueDate = billingMonthEndDate(input.billingMonth);
  const dueDate = paymentDueDate(input.billingMonth);
  const invNo = invoiceNumber(input.billingMonth, input.invoiceNumberPrefix ?? "RENT");

  pdfTitle(w, input.template?.pdf.title ?? "請 求 書", 20);
  w.doc.moveDown(0.5);

  pdfMetaBlock(w, [
    { label: "請求番号", value: invNo },
    { label: "発行日", value: formatJapaneseDate(issueDate) },
    { label: "お支払期限", value: formatJapaneseDate(dueDate) },
  ]);

  pdfSection(w, "請求先");
  pdfParagraph(w, `${input.tenantName}　御中`, 11);
  w.doc.moveDown(0.3);

  pdfSection(w, "請求元");
  pdfParagraph(w, input.companyName, 11);
  pdfParagraph(w, input.companyAddress, 10);
  pdfParagraph(w, `インボイス登録番号: ${input.invoiceRegistrationNumber}`, 10);
  w.doc.moveDown(0.5);

  pdfSection(w, "請求内容");
  pdfParagraph(
    w,
    `下記のとおり、${formatJapaneseYearMonth(input.billingMonth)}分の賃料をご請求申し上げます。`,
    10
  );
  pdfParagraph(w, `物件: ${input.propertyLocation}`, 10);
  w.doc.moveDown(0.3);

  pdfTable(w, buildRentInvoiceRows(input), { labelWidth: w.contentWidth * 0.62 });

  pdfSection(w, "お振込先");
  pdfParagraph(w, input.bankAccount, 10);
  w.doc.moveDown(0.5);

  pdfSection(w, "備考");
  const footerNotes =
    input.template?.pdf.footer_notes?.trim() ??
    "・振込手数料は貴社にてご負担ください。\n" +
      "・ご入金確認後、領収書が必要な場合はお申し付けください。\n" +
      "・消費税の課税区分は税理士確認中です。";
  pdfParagraph(w, footerNotes, 9);

  await writePdfToFile(w.doc, outputPath);
  return outputPath;
}
