import { parseBankAdapter } from "./bank.js";
import {
  parseCardAdapter,
  parseMarketplaceAdapter,
  parseSalesAdapter,
  parseTransitAdapter,
  parseWalletAdapter,
} from "./generic-csv.js";
import { parseContractsAdapter, parseReceiptsAdapter } from "./receipt-md.js";
import type { AdapterParseResult } from "./types.js";
import type { IngestSourceKind } from "../../../../../schemas/finance/ingest.js";

export function parseIngestSource(
  source: IngestSourceKind,
  content: string,
  fileName: string,
): AdapterParseResult {
  switch (source) {
    case "bank":
      return parseBankAdapter(content, fileName);
    case "card":
      return parseCardAdapter(content, fileName);
    case "transit":
      return parseTransitAdapter(content, fileName);
    case "wallet":
      return parseWalletAdapter(content, fileName);
    case "marketplace":
      return parseMarketplaceAdapter(content, fileName);
    case "sales":
      return parseSalesAdapter(content, fileName);
    case "receipts":
      return parseReceiptsAdapter(content, fileName);
    case "contracts":
      return parseContractsAdapter(content, fileName);
    default: {
      const _exhaustive: never = source;
      throw new Error(`unknown ingest source: ${_exhaustive}`);
    }
  }
}

export * from "./types.js";
