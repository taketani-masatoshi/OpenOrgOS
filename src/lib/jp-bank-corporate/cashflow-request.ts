export type CashflowGranularity = "daily" | "weekly" | "monthly";
export type CashflowFormat = "md" | "csv" | "json";

export interface CashflowRequest {
  granularity: CashflowGranularity;
  horizon: string;
  format: CashflowFormat;
  write: boolean;
}

export type CashflowRequestValidation =
  { ok: true; request: CashflowRequest } | { ok: false; error: string };

export type CashflowChatIntent =
  | { intent: false }
  | { intent: true; ok: true; request: CashflowRequest }
  | { intent: true; ok: false; error: string };

const CASHFLOW_INTENT =
  /(?:資金\s*繰り(?:表)?|キャッシュ\s*フロー|cash[\s-]*flow|日次\s*\d{1,4}\s*日|月次\s*\d{1,4}\s*(?:か月|ヶ月|ケ月|カ月|月間))/iu;
const EXPLICIT_WRITE =
  /(?:保存(?:して|する|してください|をお願いします)|書き込(?:み|んで|む)|更新して|上書き(?:して)?|\bsave\b|\bwrite\b|\bpersist\b|\bupdate\b)/iu;

const LIMITS: Record<CashflowGranularity, { unit: "d" | "w" | "m"; max: number }> = {
  daily: { unit: "d", max: 366 },
  weekly: { unit: "w", max: 52 },
  monthly: { unit: "m", max: 24 },
};

function normalize(message: string): string {
  return message.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

export function isCashflowChatIntent(message: string): boolean {
  return CASHFLOW_INTENT.test(normalize(message));
}

function explicitGranularity(message: string): CashflowGranularity | undefined {
  if (/(?:日次|毎日|\bdaily\b)/iu.test(message)) return "daily";
  if (/(?:週次|毎週|\bweekly\b)/iu.test(message)) return "weekly";
  if (/(?:月次|毎月|\bmonthly\b)/iu.test(message)) return "monthly";
  return undefined;
}

function parseHorizon(
  message: string
): { value: number; unit: "d" | "w" | "m"; granularity: CashflowGranularity } | undefined {
  const patterns: Array<{
    pattern: RegExp;
    unit: "d" | "w" | "m";
    granularity: CashflowGranularity;
  }> = [
    { pattern: /(\d{1,4})\s*(?:日|days?\b)/iu, unit: "d", granularity: "daily" },
    { pattern: /(\d{1,4})\s*(?:週|weeks?\b)/iu, unit: "w", granularity: "weekly" },
    {
      pattern: /(\d{1,4})\s*(?:か月|ヶ月|ケ月|カ月|月間|months?\b)/iu,
      unit: "m",
      granularity: "monthly",
    },
  ];
  for (const candidate of patterns) {
    const match = message.match(candidate.pattern);
    if (match?.[1]) {
      return {
        value: Number(match[1]),
        unit: candidate.unit,
        granularity: candidate.granularity,
      };
    }
  }
  return undefined;
}

function requestedFormat(message: string): CashflowFormat {
  if (/(?:\bcsv\b|csv形式)/iu.test(message)) return "csv";
  if (/(?:\bjson\b|json形式)/iu.test(message)) return "json";
  return "md";
}

export function validateCashflowRequest(args: Record<string, unknown>): CashflowRequestValidation {
  const granularity = args.granularity;
  const format = args.format;
  const horizon = typeof args.horizon === "string" ? args.horizon.trim().toLowerCase() : "";
  if (
    !["daily", "weekly", "monthly"].includes(String(granularity)) ||
    !["md", "csv", "json"].includes(String(format)) ||
    typeof args.write !== "boolean"
  ) {
    return {
      ok: false,
      error:
        "granularity (daily|weekly|monthly), horizon, format (md|csv|json), and write (boolean) are required",
    };
  }

  const horizonMatch = horizon.match(/^(\d+)([dwm])$/u);
  if (!horizonMatch) {
    return { ok: false, error: "horizon must be a positive duration such as 90d, 13w, or 3m" };
  }
  const typedGranularity = granularity as CashflowGranularity;
  const limit = LIMITS[typedGranularity];
  const value = Number(horizonMatch[1]);
  const unit = horizonMatch[2];
  if (unit !== limit.unit) {
    return { ok: false, error: `horizon unit must match ${typedGranularity} granularity` };
  }
  if (!Number.isSafeInteger(value) || value < 1 || value > limit.max) {
    return {
      ok: false,
      error: `${typedGranularity} horizon must be between 1 and ${limit.max}${limit.unit}`,
    };
  }

  return {
    ok: true,
    request: {
      granularity: typedGranularity,
      horizon: `${value}${limit.unit}`,
      format: format as CashflowFormat,
      write: args.write,
    },
  };
}

export function parseCashflowChatIntent(message: string): CashflowChatIntent {
  const normalized = normalize(message);
  if (!isCashflowChatIntent(normalized)) return { intent: false };

  const horizon = parseHorizon(normalized);
  const explicit = explicitGranularity(normalized);
  if (explicit && horizon && explicit !== horizon.granularity) {
    return {
      intent: true,
      ok: false,
      error: "粒度と期間の単位が一致していません。",
    };
  }

  const granularity = explicit ?? horizon?.granularity ?? "weekly";
  const limit = LIMITS[granularity];
  const validation = validateCashflowRequest({
    granularity,
    horizon: horizon ? `${horizon.value}${horizon.unit}` : `13${limit.unit}`,
    format: requestedFormat(normalized),
    write: EXPLICIT_WRITE.test(normalized),
  });
  if (!validation.ok) {
    return { intent: true, ok: false, error: validation.error };
  }
  return { intent: true, ok: true, request: validation.request };
}
