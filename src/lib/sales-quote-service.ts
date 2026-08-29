/**
 * Sales quote mutations.
 */
import type { SalesQuote, SalesQuoteStatus } from "../../schemas/sales.js";
import { salesQuotesFileSchema } from "../../schemas/sales.js";
import { loadSalesQuotes, saveSalesQuotes } from "./data.js";
import { appendAuditEvent } from "./audit-log.js";
import { currentDate } from "./utils.js";

export function nextQuoteId(year = currentDate().slice(0, 4)): string {
  const file = loadSalesQuotes();
  const quotes = file?.quotes ?? [];
  let max = 0;
  const prefix = `QUOTE-${year}-`;
  for (const q of quotes) {
    if (!q.id.startsWith(prefix)) continue;
    const seq = Number.parseInt(q.id.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function createQuote(
  input: Omit<SalesQuote, "id" | "status"> & { id?: string; status?: SalesQuoteStatus },
  actor?: string,
): SalesQuote {
  const file = loadSalesQuotes() ?? salesQuotesFileSchema.parse({ version: 1, quotes: [] });
  const quote: SalesQuote = salesQuotesFileSchema.shape.quotes.element.parse({
    ...input,
    id: input.id ?? nextQuoteId(),
    status: input.status ?? "draft",
  });
  file.quotes.push(quote);
  saveSalesQuotes(file);
  appendAuditEvent({
    event: "sales_quote",
    ref: quote.id,
    actor,
    detail: `created:${quote.deal_id}`,
  });
  return quote;
}

export function setQuoteStatus(opts: {
  quoteId: string;
  status: SalesQuoteStatus;
  sentOn?: string;
  actor?: string;
}): SalesQuote {
  const file = loadSalesQuotes();
  const idx = file?.quotes.findIndex((q) => q.id === opts.quoteId) ?? -1;
  if (idx < 0 || !file) throw new Error(`quote not found: ${opts.quoteId}`);
  const quote: SalesQuote = {
    ...file.quotes[idx]!,
    status: opts.status,
    sent_on: opts.status === "sent" ? (opts.sentOn ?? currentDate()) : file.quotes[idx]!.sent_on,
  };
  file.quotes[idx] = quote;
  saveSalesQuotes(file);
  appendAuditEvent({
    event: "sales_quote",
    ref: opts.quoteId,
    actor: opts.actor,
    detail: `status:${opts.status}`,
  });
  return quote;
}
