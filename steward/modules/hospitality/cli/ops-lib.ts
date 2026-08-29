import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  hospitalityStaySchema,
  hospitalityStaysFileSchema,
  lodgingTaxLedgerFileSchema,
  lodgingTaxRatesFileSchema,
  type HospitalityStay,
  type HospitalityStaysFile,
  type LodgingTaxLedgerFile,
  type LodgingTaxPeriodFiling,
  type LodgingTaxRatesFile,
} from "../../../../schemas/hospitality-ops.js";
import { loadEnabledModulesSafe } from "../../../../src/lib/modules.js";
import { getClock } from "../../../../src/lib/runtime-context.js";
import { resolveTenantPath } from "../../../../src/lib/tenant.js";
import {
  currentDate,
  daysBetween,
  readYamlFile,
  writeTrackedFile,
  writeYamlFile,
} from "../../../../src/lib/utils.js";

export const STAYS_REL = "data/operations/stays.yaml";
export const TAX_LEDGER_REL = "data/operations/lodging-tax.yaml";
export const TAX_RATES_REL = "data/operations/lodging-tax-rates.yaml";

export type { HospitalityStay };

export type HospitalityOpsDueItem = {
  id: string;
  severity: "p0" | "p1" | "p2";
  kind: "tax" | "stay" | "cleaning" | "register" | "damage" | "recurring" | "id_doc" | "nights_cap";
  title: string;
  due_on: string;
  cli_hint: string;
};

export type StayMetrics = {
  period: string;
  property_id: string;
  available_nights: number;
  occupied_nights: number;
  occupancy: number;
  revenue_jpy: number;
  adr: number;
  revpar: number;
  stay_count: number;
};

export type OtaImportRow = {
  check_in: string;
  check_out: string;
  party_size: number;
  ota_ref?: string;
  rate_per_night_jpy?: number;
  channel: HospitalityStay["channel"];
};

export function hospitalityModuleEnabled(): boolean {
  return loadEnabledModulesSafe().some((m) => m.id === "hospitality" && m.enabled);
}

export function defaultHospitalityPropertyId(): string {
  const mod = loadEnabledModulesSafe().find((m) => m.id === "hospitality" && m.enabled);
  return mod?.property_ids?.[0] ?? "PROP-002";
}

function emptyStays(): HospitalityStaysFile {
  return hospitalityStaysFileSchema.parse({ version: 1, stays: [] });
}

function emptyLedger(): LodgingTaxLedgerFile {
  return lodgingTaxLedgerFileSchema.parse({ version: 1 });
}

export function staysPath(): string {
  return resolveTenantPath(STAYS_REL);
}

export function loadStays(): HospitalityStaysFile {
  const path = staysPath();
  if (!existsSync(path)) return emptyStays();
  return readYamlFile(path, hospitalityStaysFileSchema);
}

export function saveStays(file: HospitalityStaysFile): void {
  writeYamlFile(staysPath(), hospitalityStaysFileSchema.parse(file));
}

export function loadTaxLedger(): LodgingTaxLedgerFile {
  const path = resolveTenantPath(TAX_LEDGER_REL);
  if (!existsSync(path)) return emptyLedger();
  return readYamlFile(path, lodgingTaxLedgerFileSchema);
}

export function saveTaxLedger(file: LodgingTaxLedgerFile): void {
  writeYamlFile(resolveTenantPath(TAX_LEDGER_REL), lodgingTaxLedgerFileSchema.parse(file));
}

export function loadTaxRates(): LodgingTaxRatesFile | null {
  const path = resolveTenantPath(TAX_RATES_REL);
  if (!existsSync(path)) return null;
  return readYamlFile(path, lodgingTaxRatesFileSchema);
}

export function stayNights(stay: Pick<HospitalityStay, "check_in" | "check_out" | "nights">): number {
  if (stay.nights && stay.nights > 0) return stay.nights;
  return Math.max(1, daysBetween(stay.check_in, stay.check_out));
}

export function nextStayId(file = loadStays(), year = currentDate().slice(0, 4)): string {
  const prefix = `STAY-${year}-`;
  let max = 0;
  for (const stay of file.stays) {
    if (!stay.id.startsWith(prefix)) continue;
    const n = Number(stay.id.slice(prefix.length));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function upsertStay(
  patch: Partial<HospitalityStay> & Pick<HospitalityStay, "property_id" | "check_in" | "check_out">
): HospitalityStay {
  const file = loadStays();
  const now = getClock().nowIso();
  const id = patch.id ?? nextStayId(file);
  const existing = file.stays.find((s) => s.id === id);
  const merged = hospitalityStaySchema.parse({
    channel: "direct",
    status: "booked",
    party_size: 1,
    cleaning_status: "pending",
    access_code_set: false,
    ...existing,
    ...patch,
    id,
    nights: stayNights({
      check_in: patch.check_in,
      check_out: patch.check_out,
      nights: patch.nights ?? existing?.nights,
    }),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
  const stays = existing
    ? file.stays.map((s) => (s.id === id ? merged : s))
    : [...file.stays, merged];
  saveStays({ version: 1, as_of: currentDate(), stays });
  return merged;
}

export function checkInStay(id: string): HospitalityStay {
  const stay = loadStays().stays.find((s) => s.id === id);
  if (!stay) throw new Error(`stay not found: ${id}`);
  return upsertStay({ ...stay, status: "checked_in" });
}

export function checkOutStay(id: string): HospitalityStay {
  const stay = loadStays().stays.find((s) => s.id === id);
  if (!stay) throw new Error(`stay not found: ${id}`);
  return upsertStay({ ...stay, status: "checked_out", cleaning_status: "pending" });
}

/** 東京都宿泊税: 1人1泊 1万円未満 0 · 1万以上1.5万未満 100 · 1.5万以上 200。 */
export function lodgingTaxPerPersonPerNight(
  taxablePerPersonPerNight: number,
  rates = loadTaxRates(),
  tableId?: string
): number {
  const table = rates?.tables.find((t) => t.id === (tableId ?? rates.tables[0]?.id)) ?? rates?.tables[0];
  if (!table) {
    if (taxablePerPersonPerNight < 10_000) return 0;
    if (taxablePerPersonPerNight < 15_000) return 100;
    return 200;
  }
  const sorted = [...table.brackets].sort(
    (a, b) => a.min_per_person_per_night_jpy - b.min_per_person_per_night_jpy
  );
  let tax = 0;
  for (const bracket of sorted) {
    const underMax =
      bracket.max_per_person_per_night_jpy === undefined ||
      taxablePerPersonPerNight < bracket.max_per_person_per_night_jpy;
    if (taxablePerPersonPerNight >= bracket.min_per_person_per_night_jpy && underMax) {
      tax = bracket.tax_per_person_per_night_jpy;
    }
  }
  return tax;
}

export function periodOfDate(iso: string): string {
  return iso.slice(0, 7);
}

function daysInPeriod(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function tokyoDueOn(period: string): string {
  return lodgingTaxDueOn(period);
}

/** 東京都宿泊税申告期限 — 宿泊月の翌月末（12月分は翌年1/4）。 */
export function lodgingTaxDueOn(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (m === 12) return `${y + 1}-01-04`;
  const last = new Date(y, m + 1, 0).getDate();
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function overlapsPeriod(stay: HospitalityStay, period: string): boolean {
  const start = `${period}-01`;
  const end = `${period}-${String(daysInPeriod(period)).padStart(2, "0")}`;
  return stay.check_in <= end && stay.check_out > start;
}

export function computeStayMetrics(period: string, propertyId = defaultHospitalityPropertyId()): StayMetrics {
  const stays = loadStays().stays.filter(
    (s) =>
      s.property_id === propertyId &&
      s.status !== "cancelled" &&
      s.status !== "no_show" &&
      overlapsPeriod(s, period)
  );
  const available = daysInPeriod(period);
  let occupied = 0;
  let revenue = 0;
  for (const stay of stays) {
    const nights = stayNights(stay);
    occupied += nights;
    revenue += (stay.rate_per_night_jpy ?? 0) * nights;
  }
  return {
    period,
    property_id: propertyId,
    available_nights: available,
    occupied_nights: occupied,
    occupancy: available === 0 ? 0 : occupied / available,
    revenue_jpy: revenue,
    adr: occupied === 0 ? 0 : revenue / occupied,
    revpar: available === 0 ? 0 : revenue / available,
    stay_count: stays.length,
  };
}

export function computeLodgingTax(period: string): LodgingTaxLedgerFile {
  const ledger = loadTaxLedger();
  const rates = loadTaxRates();
  const tableId = ledger.rate_table_id || rates?.tables[0]?.id || "tokyo-metropolitan";
  const stays = loadStays().stays.filter(
    (s) => periodOfDate(s.check_in) === period && s.status !== "cancelled" && s.status !== "no_show"
  );
  const assessments = ledger.assessments.filter((a) => a.period !== period);
  const now = getClock().nowIso();
  for (const stay of stays) {
    const nights = stayNights(stay);
    const party = stay.party_size;
    const perPerson = stay.rate_per_night_jpy && party > 0 ? stay.rate_per_night_jpy / party : 0;
    const unit = lodgingTaxPerPersonPerNight(perPerson, rates, tableId);
    assessments.push({
      id: `TAX-${stay.id}-${period}`,
      stay_id: stay.id,
      property_id: stay.property_id,
      period,
      rate_table_id: tableId,
      taxable_per_person_per_night_jpy: perPerson,
      party_size: party,
      nights,
      tax_jpy: unit * party * nights,
      computed_at: now,
    });
  }
  const previous = ledger.period_filings.find((f) => f.period === period);
  const filings = ledger.period_filings.filter((f) => f.period !== period);
  filings.push({
    period,
    due_on: previous?.due_on ?? tokyoDueOn(period),
    status: "computed",
    notes: previous?.notes,
    pack_path: previous?.pack_path,
    filed_on: previous?.filed_on,
  });
  const next: LodgingTaxLedgerFile = {
    ...ledger,
    rate_table_id: tableId,
    assessments,
    period_filings: filings.sort((a, b) => a.period.localeCompare(b.period)),
  };
  saveTaxLedger(next);
  return next;
}

export function taxStatus(period?: string): {
  period: string;
  filing?: LodgingTaxPeriodFiling;
  tax_jpy: number;
  paid_jpy: number;
  gap_jpy: number;
}[] {
  const ledger = loadTaxLedger();
  const periods = period
    ? [period]
    : [...new Set(ledger.period_filings.map((f) => f.period))].sort();
  return periods.map((p) => {
    const filing = ledger.period_filings.find((f) => f.period === p);
    const tax_jpy = ledger.assessments.filter((a) => a.period === p).reduce((s, a) => s + a.tax_jpy, 0);
    const paid_jpy = ledger.payments.filter((x) => x.period === p).reduce((s, x) => s + x.amount_jpy, 0);
    return { period: p, filing, tax_jpy, paid_jpy, gap_jpy: tax_jpy - paid_jpy };
  });
}

export function writeTaxPack(period: string): string {
  const ledger = loadTaxLedger();
  const rows = ledger.assessments.filter((a) => a.period === period);
  const total = rows.reduce((s, a) => s + a.tax_jpy, 0);
  const paid = ledger.payments.filter((x) => x.period === period).reduce((s, x) => s + x.amount_jpy, 0);
  const filing = ledger.period_filings.find((f) => f.period === period);
  const due = filing?.due_on ?? tokyoDueOn(period);
  const lines = [
    `# 宿泊税申告パック — ${period}`,
    "",
    `生成: ${getClock().nowIso()}`,
    "",
    "## いつ · どこで · どう",
    "",
    (ledger.filing.how_ja ?? "").trim() ||
      "各月の宿泊分を翌月末日までに申告・納入。OrgOS は行政送信しない。",
    "",
    `- 当局: ${ledger.filing.authority}`,
    `- 公式: ${ledger.filing.portal_url}`,
    `- eLTAX: ${ledger.filing.eltax_hint}`,
    `- 申告納期限: **${due}**`,
    "",
    "## 算定サマリ（社内）",
    "",
    "| stay_id | property | party | nights | tax_jpy |",
    "|---------|----------|-------|--------|---------|",
    ...rows.map(
      (a) => `| ${a.stay_id} | ${a.property_id} | ${a.party_size} | ${a.nights} | ${a.tax_jpy} |`
    ),
    "",
    `**合計税額: ¥${total}**`,
    `納付記録合計: ¥${paid} · 差額: ¥${total - paid}`,
    "",
    "## 人間ゲート（OrgOS は行政送信しない）",
    "",
    "1. 月計表・納入申告書を公式様式で作成（本 MD は下書きサマリ）",
    "2. eLTAX / 郵送 / 持参で申告",
    `3. operations hospitality tax-filed --period ${period} --filed-on YYYY-MM-DD`,
    `4. 納入後 operations hospitality tax-pay --period ${period} --amount ${total} --paid-on YYYY-MM-DD`,
    "",
  ];
  const mod = loadEnabledModulesSafe().find((m) => m.id === "hospitality");
  const docsRoot = (mod?.docs_root ?? "docs/properties/PROP-002-kamezawa/operations/").replace(/\/$/, "");
  const rel = `${docsRoot}/tax-packs/${period}.md`;
  const abs = resolveTenantPath(rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeTrackedFile(abs, lines.join("\n"));
  const filings = ledger.period_filings.filter((f) => f.period !== period);
  filings.push({
    period,
    due_on: due,
    status: "pack_ready",
    pack_path: rel,
    filed_on: filing?.filed_on,
    notes: filing?.notes,
  });
  saveTaxLedger({ ...ledger, period_filings: filings });
  return abs;
}

export function markTaxFiled(period: string, filedOn: string): LodgingTaxPeriodFiling {
  const ledger = loadTaxLedger();
  const existing = ledger.period_filings.find((f) => f.period === period);
  const next: LodgingTaxPeriodFiling = {
    period,
    due_on: existing?.due_on ?? tokyoDueOn(period),
    status: "filed",
    pack_path: existing?.pack_path,
    filed_on: filedOn,
    notes: existing?.notes,
  };
  saveTaxLedger({
    ...ledger,
    period_filings: [...ledger.period_filings.filter((f) => f.period !== period), next],
  });
  return next;
}

export function markTaxPaid(period: string, amount: number, paidOn: string): void {
  const ledger = loadTaxLedger();
  const payment = {
    id: `TAXPAY-${period}-${paidOn.replace(/-/g, "")}`,
    period,
    amount_jpy: amount,
    paid_on: paidOn,
    method: "bank",
  };
  saveTaxLedger({
    ...ledger,
    payments: [...ledger.payments.filter((p) => p.id !== payment.id), payment],
    period_filings: ledger.period_filings.map((f) =>
      f.period === period ? { ...f, status: "paid" as const } : f
    ),
  });
}

function mapChannel(raw: string): HospitalityStay["channel"] {
  const c = raw.toLowerCase();
  if (c.includes("airbnb")) return "airbnb";
  if (c.includes("book")) return "booking";
  if (c === "direct") return "direct";
  return "other";
}

export function parseOtaCsv(text: string): OtaImportRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const rows: OtaImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim());
    const party = Number(cols[idx("party_size")] ?? cols[2] ?? 1);
    const rate = cols[idx("rate_per_night_jpy")];
    rows.push({
      check_in: cols[idx("check_in")] ?? cols[0],
      check_out: cols[idx("check_out")] ?? cols[1],
      party_size: Number.isFinite(party) && party > 0 ? party : 1,
      ota_ref: cols[idx("ota_ref")] || undefined,
      rate_per_night_jpy: rate ? Number(rate) : undefined,
      channel: mapChannel(cols[idx("channel")] ?? "other"),
    });
  }
  return rows;
}

export function parseOtaIcal(text: string, defaultChannel: HospitalityStay["channel"] = "other"): OtaImportRow[] {
  const events = text.split(/BEGIN:VEVENT/i).slice(1);
  const rows: OtaImportRow[] = [];
  for (const block of events) {
    const field = (name: string) => {
      const m = block.match(new RegExp(`^${name}(?:;[^:]*)?:([^\\r\\n]+)`, "im"));
      return m?.[1]?.trim();
    };
    const start = field("DTSTART");
    const end = field("DTEND");
    if (!start || !end) continue;
    const toIso = (v: string) => {
      const d = v.replace(/[^0-9]/g, "").slice(0, 8);
      return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    };
    rows.push({
      check_in: toIso(start),
      check_out: toIso(end),
      party_size: 1,
      ota_ref: field("UID"),
      channel: defaultChannel,
    });
  }
  return rows;
}

export function importOtaRows(
  rows: OtaImportRow[],
  propertyId = defaultHospitalityPropertyId()
): { imported: HospitalityStay[]; skipped: string[] } {
  const imported: HospitalityStay[] = [];
  const skipped: string[] = [];
  const existing = loadStays();
  for (const row of rows) {
    const dup = existing.stays.find(
      (s) =>
        (row.ota_ref && s.ota_ref === row.ota_ref) ||
        (s.property_id === propertyId && s.check_in === row.check_in && s.check_out === row.check_out)
    );
    if (dup) {
      skipped.push(row.ota_ref ?? `${row.check_in}/${row.check_out}`);
      continue;
    }
    const stay = upsertStay({
      property_id: propertyId,
      check_in: row.check_in,
      check_out: row.check_out,
      party_size: row.party_size,
      rate_per_night_jpy: row.rate_per_night_jpy,
      channel: row.channel,
      ota_ref: row.ota_ref,
      status: "booked",
    });
    existing.stays.push(stay);
    imported.push(stay);
  }
  return { imported, skipped };
}

export function importOtaFile(
  filePath: string,
  format: "csv" | "ical",
  propertyId = defaultHospitalityPropertyId()
): { imported: HospitalityStay[]; skipped: string[] } {
  const text = readFileSync(filePath, "utf-8");
  const rows = format === "ical" ? parseOtaIcal(text) : parseOtaCsv(text);
  return importOtaRows(rows, propertyId);
}

export { listHospitalityOpsDue } from "./ops-due.js";
