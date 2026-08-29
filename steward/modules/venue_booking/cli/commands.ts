import type { VenueProviderId } from "../../../../schemas/venue-booking.js";
import {
  cancelVenueReservation,
  confirmVenueReservation,
  findVenueReservation,
  linkReservationToSchedulingCase,
  listVenueBookingAdapterIds,
  loadVenueCatalog,
  loadVenueProviders,
  loadVenueReservations,
  reserveVenue,
  searchVenueAvailability,
  suggestVenuesForParties,
  formatVenueSuggestionLines,
  applyVenueSuggestToSchedulingCase,
  VENUE_BOOKING_CHANNEL,
} from "../../../../src/lib/venue-booking/index.js";
import { findSchedulingCase } from "../../../../src/lib/scheduling-coordination/store.js";

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function runVenueProviders(opts: { json?: boolean }): void {
  const file = loadVenueProviders();
  const adapters = listVenueBookingAdapterIds();
  if (opts.json) {
    printJson({ channel: VENUE_BOOKING_CHANNEL, adapters, file });
    return;
  }
  console.log(`channel: ${VENUE_BOOKING_CHANNEL} (not Wire)`);
  console.log(`wired adapters: ${adapters.join(", ")}`);
  if (!file) {
    console.log("venue-providers.yaml 未作成 — seed example をコピーしてください");
    return;
  }
  console.log(`default_provider: ${file.default_provider}`);
  for (const p of file.providers) {
    console.log(`${p.id}\t${p.name}\tapi=${p.supports_api}\tdeep_link=${p.supports_deep_link}`);
    console.log(`  ${p.base_url}`);
  }
}

export function runVenueCatalog(opts: { json?: boolean }): void {
  const file = loadVenueCatalog();
  if (!file) {
    console.error("venue-catalog.yaml 未作成 — seed example をコピーしてください");
    process.exit(1);
  }
  if (opts.json) {
    printJson(file);
    return;
  }
  for (const v of file.venues) {
    console.log(
      `${v.id}\t${v.name}\t${v.area}\tprovider=${v.provider_id}` +
        (v.typical_budget_jpy ? `\t¥${v.typical_budget_jpy}` : "")
    );
  }
}

export function runVenueSuggest(opts: {
  caseId?: string;
  timing?: "day" | "evening";
  limit?: number;
  json?: boolean;
}): void {
  const caseRow = opts.caseId ? findSchedulingCase(opts.caseId) : undefined;
  if (opts.caseId && !caseRow) {
    console.error(`Scheduling case not found: ${opts.caseId}`);
    process.exit(1);
  }
  const result = suggestVenuesForParties({
    caseRow,
    timing: opts.timing,
    limit: opts.limit ?? 3,
  });
  const lines = formatVenueSuggestionLines(result.suggestions);
  if (opts.json) {
    printJson({ ...result, ceo_field_lines: lines });
    return;
  }
  console.log(`timing: ${result.timing}`);
  if (result.missing_party_locations) {
    console.log("⚠ party-locations.yaml 未設定またはマッチなし — カタログ順フォールバック");
  }
  for (const a of result.anchors_used) {
    console.log(`anchor\t${a.id}\t${a.party_kind}\t${a.role}\t${a.station}`);
  }
  for (const s of result.suggestions) {
    console.log(
      `${s.first_pick ? "*" : " "}\t${s.venue_id}\t${s.name}\tscore=${s.score}\t${s.facts}`
    );
    console.log(`  ${s.rationale}`);
  }
  console.log("\nCEO fields (copy):");
  console.log(`  first: ${lines.firstPick}`);
  console.log(`  A: ${lines.optionA}`);
  console.log(`  B: ${lines.optionB}`);
  console.log(`  C: ${lines.optionC}`);
}

export function runVenueApplySuggest(opts: {
  caseId: string;
  timing?: "day" | "evening";
  allowAfterClarifySent?: boolean;
  json?: boolean;
}): void {
  try {
    const updated = applyVenueSuggestToSchedulingCase({
      caseId: opts.caseId,
      timing: opts.timing,
      allowAfterClarifySent: opts.allowAfterClarifySent,
    });
    if (opts.json) {
      printJson({
        ok: true,
        case_id: updated.id,
        location: updated.location,
        venue_options: updated.venue_options,
        next_action: updated.next_action,
      });
      return;
    }
    console.log(`✓ ${updated.id} · location=${updated.location} · next=${updated.next_action}`);
    for (const o of updated.venue_options) {
      console.log(`  ${o.id}${o.first_pick ? "*" : ""} ${o.name} — ${o.facts ?? ""}`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (opts.json) {
      printJson({ ok: false, error: message });
      return;
    }
    console.error(message);
    process.exit(1);
  }
}

export async function runVenueSearch(opts: {
  venue?: string;
  venueName?: string;
  area?: string;
  provider?: string;
  partySize?: number;
  startAt?: string;
  json?: boolean;
}): Promise<void> {
  const result = await searchVenueAvailability({
    venue: opts.venue,
    venueName: opts.venueName,
    area: opts.area,
    providerId: opts.provider as VenueProviderId | undefined,
    partySize: opts.partySize,
    startAt: opts.startAt,
  });
  if (opts.json) {
    printJson(result);
    return;
  }
  console.log(`available: ${result.available}`);
  console.log(result.message);
  if (result.search_url) console.log(`search_url: ${result.search_url}`);
  if (result.deep_link_url) console.log(`deep_link: ${result.deep_link_url}`);
}

export async function runVenueReserve(opts: {
  venue?: string;
  venueName?: string;
  area?: string;
  provider?: string;
  partySize?: number;
  startAt?: string;
  endAt?: string;
  budget?: number;
  cuisine?: string;
  notes?: string;
  caseId?: string;
  requestId?: string;
  json?: boolean;
}): Promise<void> {
  const result = await reserveVenue({
    venue: opts.venue,
    venueName: opts.venueName,
    area: opts.area,
    providerId: opts.provider as VenueProviderId | undefined,
    partySize: opts.partySize,
    startAt: opts.startAt,
    endAt: opts.endAt,
    budgetPerPersonJpy: opts.budget,
    cuisine: opts.cuisine,
    notes: opts.notes,
    schedulingCaseId: opts.caseId,
    requestId: opts.requestId,
  });
  if (opts.json) {
    printJson(result);
    return;
  }
  const r = result.reservation;
  console.log(`${r.id}\t${r.status}\t${r.provider_id}\t${r.venue_name}`);
  console.log(result.message);
  if (result.search_url) console.log(`search_url: ${result.search_url}`);
  if (result.deep_link_url) console.log(`deep_link: ${result.deep_link_url}`);
  if (r.scheduling_case_id) console.log(`case: ${r.scheduling_case_id}`);
  console.log(`request_id: ${r.request_id}`);
}

export async function runVenueConfirm(opts: {
  id: string;
  externalRef?: string;
  approvalId?: string;
  allowUnapproved?: boolean;
  allowMeasurementRef?: boolean;
  json?: boolean;
}): Promise<void> {
  const row = await confirmVenueReservation({
    id: opts.id,
    externalRef: opts.externalRef,
    approvalId: opts.approvalId,
    allowUnapproved: opts.allowUnapproved,
    allowMeasurementRef: opts.allowMeasurementRef,
  });
  if (opts.json) {
    printJson(row);
    return;
  }
  console.log(`${row.id}\t${row.status}\texternal_ref=${row.external_ref ?? "—"}`);
  if (row.adapter_message) console.log(row.adapter_message);
}

export async function runVenueCancel(opts: { id: string; json?: boolean }): Promise<void> {
  const row = await cancelVenueReservation(opts.id);
  if (opts.json) {
    printJson(row);
    return;
  }
  console.log(`${row.id}\t${row.status}`);
  if (row.adapter_message) console.log(row.adapter_message);
}

export function runVenueList(opts: { status?: string; json?: boolean }): void {
  let rows = loadVenueReservations().reservations;
  if (opts.status) rows = rows.filter((r) => r.status === opts.status);
  if (opts.json) {
    printJson({ channel: VENUE_BOOKING_CHANNEL, reservations: rows });
    return;
  }
  for (const r of rows) {
    console.log(
      `${r.id}\t${r.status}\t${r.provider_id}\t${r.venue_name}\t${r.scheduling_case_id ?? "—"}`
    );
  }
}

export function runVenueShow(opts: { id: string; json?: boolean }): void {
  const row = findVenueReservation(opts.id);
  if (!row) {
    console.error(`Not found: ${opts.id}`);
    process.exit(1);
  }
  if (opts.json) {
    printJson(row);
    return;
  }
  console.log(`${row.id}  [${row.status}]  channel=${row.channel}`);
  console.log(`provider: ${row.provider_id}`);
  console.log(`venue: ${row.venue_name} / ${row.area}`);
  console.log(`party: ${row.party_size}  start: ${row.start_at}`);
  if (row.external_ref) console.log(`external_ref: ${row.external_ref}`);
  if (row.deep_link_url) console.log(`deep_link: ${row.deep_link_url}`);
  if (row.search_url) console.log(`search_url: ${row.search_url}`);
  if (row.scheduling_case_id) console.log(`case: ${row.scheduling_case_id}`);
  if (row.approval_id) console.log(`approval: ${row.approval_id}`);
  if (row.adapter_message) console.log(`adapter: ${row.adapter_message}`);
}

export function runVenueLinkCase(opts: {
  id: string;
  caseId: string;
  json?: boolean;
}): void {
  const row = findVenueReservation(opts.id);
  if (!row) {
    console.error(`Not found: ${opts.id}`);
    process.exit(1);
  }
  linkReservationToSchedulingCase(opts.caseId, row);
  const updated = findVenueReservation(opts.id)!;
  if (opts.json) {
    printJson(updated);
    return;
  }
  console.log(`linked ${updated.id} → ${opts.caseId}`);
}
