import PDFDocument from "pdfkit";

export function renderQuotePdf(input: {
  quoteId: string;
  title: string;
  amountYen: number;
  dealId?: string;
  accountId?: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", compress: false });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(16).text(input.title);
    doc.moveDown();
    doc.fontSize(12).text(input.quoteId);
    if (input.dealId) doc.text(input.dealId);
    if (input.accountId) doc.text(input.accountId);
    doc.text(`${input.amountYen} JPY`);
    doc.moveDown();
    doc.text("Draft. Sending requires human approval.");
    doc.end();
  });
}

/** PDF draft from a sales quote record. Does not send. */
export function renderSalesQuotePdf(quote: {
  id: string;
  deal_id: string;
  account_id: string;
  amount_man?: number;
}): Promise<Buffer> {
  const amountYen = Math.round((quote.amount_man ?? 0) * 10_000);
  return renderQuotePdf({
    quoteId: quote.id,
    title: quote.deal_id,
    amountYen,
    dealId: quote.deal_id,
    accountId: quote.account_id,
  });
}
