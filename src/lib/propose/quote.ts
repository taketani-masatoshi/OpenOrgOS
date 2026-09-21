import PDFDocument from "pdfkit";
import { loadSalesQuotes } from "../data.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

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

/** Resolve quote fields from sales quotes SoT when only quoteId is given. */
export function resolveQuoteDraftInput(input: {
  quoteId: string;
  title?: string;
  amountYen?: number;
  dealId?: string;
  accountId?: string;
}): {
  draft: {
    quoteId: string;
    title: string;
    amountYen: number;
    dealId?: string;
    accountId?: string;
  };
  inputs_ref: string[];
} {
  if (input.title != null && input.amountYen != null) {
    return {
      draft: {
        quoteId: input.quoteId,
        title: input.title,
        amountYen: input.amountYen,
        dealId: input.dealId,
        accountId: input.accountId,
      },
      inputs_ref: [],
    };
  }
  const quotes = loadSalesQuotes()?.quotes ?? [];
  const found = quotes.find((row) => row.id === input.quoteId);
  if (!found) {
    return {
      draft: {
        quoteId: input.quoteId,
        title: input.title ?? input.quoteId,
        amountYen: input.amountYen ?? 0,
        dealId: input.dealId,
        accountId: input.accountId,
      },
      inputs_ref: [],
    };
  }
  return {
    draft: {
      quoteId: found.id,
      title: found.deal_id,
      amountYen: Math.round((found.amount_man ?? 0) * 10_000),
      dealId: found.deal_id,
      accountId: found.account_id,
    },
    inputs_ref: ["data/sales/quotes.yaml"],
  };
}

/** PDF draft metadata. Does not send and does not auto-assemble from a deal transcript. */
export async function renderQuoteDraftReport(input: {
  quoteId: string;
  title?: string;
  amountYen?: number;
  dealId?: string;
  accountId?: string;
}): Promise<Record<string, unknown> & { pdf: Buffer }> {
  const resolved = resolveQuoteDraftInput(input);
  const pdf = await renderQuotePdf(resolved.draft);
  return {
    ...flattenProposeReport(
      makeProposeReport({
        kind: "quote-draft-report",
        depth: resolved.inputs_ref.length > 0 ? "L2" : "L1",
        inputs_ref: resolved.inputs_ref,
        human_gate: { apply: "human", sent: false },
        payload: {
          quoteId: resolved.draft.quoteId,
          bytes: pdf.length,
          sent: false,
          autoAssemble: false,
        },
      }),
    ),
    pdf,
  };
}
