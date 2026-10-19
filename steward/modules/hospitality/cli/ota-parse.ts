import type { HospitalityStay } from "../../../../schemas/hospitality-ops.js";
import { parseCsv } from "../../../../src/lib/csv.js";

/** Reservation state as exported by an OTA — `unconfirmed` rows are never imported. */
export type OtaReservationStatus =
  "booked" | "checked_in" | "checked_out" | "cancelled" | "unconfirmed";

export type OtaImportRow = {
  check_in: string;
  check_out: string;
  party_size: number;
  ota_ref?: string;
  rate_per_night_jpy?: number;
  channel: HospitalityStay["channel"];
  status?: OtaReservationStatus;
};

const DEFAULT_PARTY_SIZE = 1;

/** Airbnb reservations export (English UI) — guest name / contact columns are ignored (PII). */
const AIRBNB_COLUMNS = {
  confirmationCode: "confirmation code",
  status: "status",
  adults: "# of adults",
  children: "# of children",
  startDate: "start date",
  endDate: "end date",
} as const;

const AIRBNB_STATUS_RULES: readonly { pattern: RegExp; status: OtaReservationStatus }[] = [
  { pattern: /cancel/i, status: "cancelled" },
  { pattern: /past guest/i, status: "checked_out" },
  { pattern: /currently hosting/i, status: "checked_in" },
  { pattern: /confirmed|upcoming|arriving/i, status: "booked" },
  { pattern: /pending|request|inquiry|expired|declined|awaiting/i, status: "unconfirmed" },
];

/** Airbnb iCal marks host blocks / unavailable dates with this summary; reservations use "Reserved". */
const AIRBNB_BLOCK_SUMMARY = /not available/i;

function mapChannel(raw: string): HospitalityStay["channel"] {
  const c = raw.toLowerCase();
  if (c.includes("airbnb")) return "airbnb";
  if (c.includes("book")) return "booking";
  if (c === "direct") return "direct";
  return "other";
}

function normalizedHeader(header: string[]): string[] {
  return header.map((h) =>
    h
      .trim()
      .replace(/^\uFEFF/, "")
      .toLowerCase()
  );
}

export function isAirbnbReservationsHeader(header: string[]): boolean {
  const names = normalizedHeader(header);
  return [AIRBNB_COLUMNS.confirmationCode, AIRBNB_COLUMNS.startDate, AIRBNB_COLUMNS.endDate].every(
    (name) => names.includes(name)
  );
}

/** Generic `check_in,check_out,...` CSV, or an Airbnb reservations export (auto-detected). */
export function parseOtaCsv(text: string): OtaImportRow[] {
  const { header, rows } = parseCsv(text);
  if (header.length === 0) return [];
  if (isAirbnbReservationsHeader(header)) return parseAirbnbRows(header, rows);
  return parseGenericRows(header, rows);
}

function requireColumn(names: string[], name: string, format: string): number {
  const index = names.indexOf(name);
  if (index < 0) {
    throw new Error(`${format} CSV に列 "${name}" がありません`);
  }
  return index;
}

function parseGenericRows(header: string[], rows: string[][]): OtaImportRow[] {
  const names = normalizedHeader(header);
  const checkIn = requireColumn(names, "check_in", "OTA");
  const checkOut = requireColumn(names, "check_out", "OTA");
  const cell = (cols: string[], name: string) => {
    const index = names.indexOf(name);
    return index < 0 ? undefined : cols[index]?.trim() || undefined;
  };
  return rows.map((cols) => {
    const party = Number(cell(cols, "party_size") ?? DEFAULT_PARTY_SIZE);
    const rate = cell(cols, "rate_per_night_jpy");
    return {
      check_in: cols[checkIn].trim(),
      check_out: cols[checkOut].trim(),
      party_size: Number.isInteger(party) && party > 0 ? party : DEFAULT_PARTY_SIZE,
      ota_ref: cell(cols, "ota_ref"),
      rate_per_night_jpy: rate ? Number(rate) : undefined,
      channel: mapChannel(cell(cols, "channel") ?? "other"),
    };
  });
}

/** Airbnb exports dates as MM/DD/YYYY (English UI); ISO dates are accepted as-is. */
export function parseAirbnbDate(raw: string, rowNumber: number): string {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    throw new Error(`Airbnb CSV ${rowNumber} 行目: 日付 "${value}" を解釈できません（MM/DD/YYYY）`);
  }
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function mapAirbnbStatus(raw: string, rowNumber: number): OtaReservationStatus {
  const rule = AIRBNB_STATUS_RULES.find((r) => r.pattern.test(raw));
  if (!rule) {
    throw new Error(`Airbnb CSV ${rowNumber} 行目: 不明なステータス "${raw.trim()}"`);
  }
  return rule.status;
}

function parseHeadcount(raw: string | undefined): number {
  const n = Number((raw ?? "").trim() || 0);
  return Number.isInteger(n) && n >= 0 ? n : Number.NaN;
}

/**
 * Party size = adults + children. Infants are excluded so the per-person rate used for
 * lodging tax is not diluted by guests who are not charged.
 * The export's "Earnings" column is the host payout, not the room rate, so the rate stays unset.
 */
function parseAirbnbRows(header: string[], rows: string[][]): OtaImportRow[] {
  const names = normalizedHeader(header);
  const col = {
    code: requireColumn(names, AIRBNB_COLUMNS.confirmationCode, "Airbnb"),
    status: requireColumn(names, AIRBNB_COLUMNS.status, "Airbnb"),
    adults: requireColumn(names, AIRBNB_COLUMNS.adults, "Airbnb"),
    children: names.indexOf(AIRBNB_COLUMNS.children),
    start: requireColumn(names, AIRBNB_COLUMNS.startDate, "Airbnb"),
    end: requireColumn(names, AIRBNB_COLUMNS.endDate, "Airbnb"),
  };
  return rows.map((cols, i) => {
    const rowNumber = i + 2;
    const status = mapAirbnbStatus(cols[col.status] ?? "", rowNumber);
    const party =
      parseHeadcount(cols[col.adults]) +
      (col.children < 0 ? 0 : parseHeadcount(cols[col.children]));
    if (status !== "unconfirmed" && status !== "cancelled" && !(party > 0)) {
      throw new Error(`Airbnb CSV ${rowNumber} 行目: 人数（大人+子ども）が読めません`);
    }
    return {
      check_in: parseAirbnbDate(cols[col.start] ?? "", rowNumber),
      check_out: parseAirbnbDate(cols[col.end] ?? "", rowNumber),
      party_size: party > 0 ? party : DEFAULT_PARTY_SIZE,
      ota_ref: cols[col.code]?.trim() || undefined,
      channel: "airbnb",
      status,
    };
  });
}

function icalField(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`^${name}(?:;[^:]*)?:([^\\r\\n]+)`, "im"));
  return m?.[1]?.trim();
}

function icalDateToIso(value: string): string {
  const d = value.replace(/[^0-9]/g, "").slice(0, 8);
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** Airbnb feeds are recognised by PRODID or `@airbnb.com` UIDs. */
export function detectIcalChannel(text: string): HospitalityStay["channel"] {
  return /airbnb/i.test(icalField(text, "PRODID") ?? "") || /@airbnb\.com/i.test(text)
    ? "airbnb"
    : "other";
}

/**
 * iCal carries dates only — party size defaults to 1 and the rate stays unset,
 * so lodging tax refuses to compute until the stay is completed with `stay-upsert`.
 */
export function parseOtaIcal(text: string, channel?: HospitalityStay["channel"]): OtaImportRow[] {
  const resolvedChannel = channel ?? detectIcalChannel(text);
  const rows: OtaImportRow[] = [];
  for (const block of text.split(/BEGIN:VEVENT/i).slice(1)) {
    const start = icalField(block, "DTSTART");
    const end = icalField(block, "DTEND");
    if (!start || !end) continue;
    const summary = icalField(block, "SUMMARY") ?? "";
    if (resolvedChannel === "airbnb" && AIRBNB_BLOCK_SUMMARY.test(summary)) continue;
    rows.push({
      check_in: icalDateToIso(start),
      check_out: icalDateToIso(end),
      party_size: DEFAULT_PARTY_SIZE,
      ota_ref: icalField(block, "UID"),
      channel: resolvedChannel,
    });
  }
  return rows;
}
