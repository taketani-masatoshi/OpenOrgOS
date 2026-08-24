import { randomUUID } from "node:crypto";
import {
  venueReservationRequestSchema,
  type VenueProviderId,
  type VenueReservation,
  type VenueReservationRequestInput,
} from "../../../schemas/venue-booking.js";
import { findSchedulingCase, updateSchedulingCase } from "../scheduling-coordination/store.js";
import { applyNextAction } from "../scheduling-coordination/next-action.js";
import { ensureSchedulingCorrespondenceDrafts } from "../scheduling-coordination/lifecycle.js";
import { loadOrgApprovalRegistry } from "../org/approval/registry.js";
import {
  assertHotpepperExternalRefShape,
  isMeasurementExternalRef,
} from "../correspondence/measurement-ref.js";
import { getVenueBookingAdapter } from "./registry.js";
import {
  findVenueCatalogEntry,
  findVenueReservation,
  loadVenueReservations,
  nextVenueReservationId,
  upsertVenueReservation,
} from "./store.js";

export { isMeasurementExternalRef } from "../correspondence/measurement-ref.js";

function nowIso(): string {
  return new Date().toISOString();
}

function assertNotWireChannel(channel: string): void {
  if (channel === "wire" || channel.startsWith("protocol")) {
    throw new Error("venue_booking must not use Wire / protocol transport");
  }
}

export interface VenueReserveOptions {
  providerId?: VenueProviderId;
  venue?: string;
  venueName?: string;
  area?: string;
  partySize?: number;
  startAt?: string;
  endAt?: string;
  budgetPerPersonJpy?: number;
  cuisine?: string;
  notes?: string;
  schedulingCaseId?: string;
  requestId?: string;
}

export interface VenueReserveResult {
  reservation: VenueReservation;
  deep_link_url?: string;
  search_url?: string;
  message: string;
}

function resolveVenueFields(opts: VenueReserveOptions): {
  venue_name: string;
  area: string;
  provider_id: VenueProviderId;
  budget_per_person_jpy?: number;
  cuisine?: string;
} {
  const catalog = opts.venue ? findVenueCatalogEntry(opts.venue) : undefined;
  const venue_name = opts.venueName ?? catalog?.name;
  const area = opts.area ?? catalog?.area;
  if (!venue_name || !area) {
    throw new Error(
      "venue_name and area are required (or --venue matching venue-catalog.yaml entry)"
    );
  }
  return {
    venue_name,
    area,
    provider_id: opts.providerId ?? catalog?.provider_id ?? "manual",
    budget_per_person_jpy: opts.budgetPerPersonJpy ?? catalog?.typical_budget_jpy,
    cuisine: opts.cuisine,
  };
}

/**
 * P0/P1: check availability + hold via adapter (deep-link / manual).
 * Idempotent on request_id — same key returns existing row without re-calling adapter.
 */
export async function reserveVenue(opts: VenueReserveOptions): Promise<VenueReserveResult> {
  const fields = resolveVenueFields(opts);
  const requestId = opts.requestId?.trim() || `vb-${randomUUID()}`;

  const existing = loadVenueReservations().reservations.find((r) => r.request_id === requestId);
  if (existing) {
    return {
      reservation: existing,
      deep_link_url: existing.deep_link_url,
      search_url: existing.search_url,
      message: `idempotent hit: ${existing.id} (request_id=${requestId})`,
    };
  }

  if (opts.schedulingCaseId) {
    const sch = findSchedulingCase(opts.schedulingCaseId);
    if (!sch) throw new Error(`Scheduling case ${opts.schedulingCaseId} not found`);
  }

  const reqInput: VenueReservationRequestInput = {
    provider_id: fields.provider_id,
    venue_name: fields.venue_name,
    area: fields.area,
    party_size: opts.partySize ?? 2,
    start_at: opts.startAt ?? nowIso().slice(0, 16),
    end_at: opts.endAt,
    budget_per_person_jpy: fields.budget_per_person_jpy,
    cuisine: fields.cuisine,
    notes: opts.notes,
    scheduling_case_id: opts.schedulingCaseId,
    request_id: requestId,
  };
  const req = venueReservationRequestSchema.parse(reqInput);
  assertNotWireChannel("venue_booking");

  const adapter = getVenueBookingAdapter(req.provider_id);
  await adapter.checkAvailability(req);
  const hold = await adapter.hold(req);

  const id = nextVenueReservationId();
  const ts = nowIso();
  const status =
    hold.status === "held"
      ? "held"
      : hold.status === "pending_manual"
        ? "pending_manual"
        : "failed";

  const reservation: VenueReservation = {
    id,
    channel: "venue_booking",
    status,
    provider_id: req.provider_id,
    venue_name: req.venue_name,
    area: req.area,
    party_size: req.party_size,
    start_at: req.start_at,
    end_at: req.end_at,
    budget_per_person_jpy: req.budget_per_person_jpy,
    cuisine: req.cuisine,
    scheduling_case_id: req.scheduling_case_id,
    request_id: requestId,
    external_ref: hold.external_ref,
    hold_expires_at: hold.hold_expires_at,
    deep_link_url: hold.deep_link_url,
    search_url: hold.search_url,
    adapter_message: hold.message,
    created_at: ts,
    updated_at: ts,
    notes: req.notes,
  };

  upsertVenueReservation(reservation);

  if (opts.schedulingCaseId) {
    linkReservationToSchedulingCase(opts.schedulingCaseId, reservation);
  }

  return {
    reservation,
    deep_link_url: reservation.deep_link_url,
    search_url: reservation.search_url,
    message: hold.message,
  };
}

export function linkReservationToSchedulingCase(
  caseId: string,
  reservation: VenueReservation
): void {
  const sch = findSchedulingCase(caseId);
  if (!sch) throw new Error(`Scheduling case ${caseId} not found`);
  updateSchedulingCase(caseId, sch.revision, (current) => ({
    ...current,
    venue_reservation_id: reservation.id,
    venue_provider: reservation.provider_id,
    location: current.location ?? `${reservation.venue_name}（${reservation.area}）`,
  }));
  const updated = findVenueReservation(reservation.id);
  if (updated && updated.scheduling_case_id !== caseId) {
    upsertVenueReservation({
      ...updated,
      scheduling_case_id: caseId,
      updated_at: nowIso(),
    });
  }
}

export interface VenueConfirmOptions {
  id: string;
  externalRef?: string;
  /** APR-* that must be approved (internal scope) */
  approvalId?: string;
  /**
   * Dev/demo only — skip org approval check.
   * Production path: pass --approval-id of an approved internal APR.
   */
  allowUnapproved?: boolean;
  /**
   * Dev/demo only — allow LIVE-MEASURE / DEMO-ONLY / TEST-REF / HP-PROOF / REH- /
   * PROOF- as external_ref. Production confirm must use a real provider number.
   */
  allowMeasurementRef?: boolean;
}

export async function confirmVenueReservation(
  opts: VenueConfirmOptions
): Promise<VenueReservation> {
  const current = findVenueReservation(opts.id);
  if (!current) throw new Error(`Venue reservation ${opts.id} not found`);
  if (current.status === "cancelled") {
    throw new Error(`${opts.id} is cancelled`);
  }
  if (current.status === "confirmed" && current.external_ref) {
    return current;
  }

  const pendingRef = opts.externalRef ?? current.external_ref;
  if (isMeasurementExternalRef(pendingRef) && !opts.allowMeasurementRef) {
    throw new Error(
      `external_ref "${pendingRef}" は計測・デモ・証明用プレースホルダです。本番の予約番号を渡すか、デモ時のみ --allow-measurement-ref を指定してください`
    );
  }
  if (
    pendingRef?.trim() &&
    !opts.allowMeasurementRef &&
    (current.provider_id === "hotpepper_deep_link" || current.provider_id === "hotpepper_api")
  ) {
    assertHotpepperExternalRefShape(pendingRef);
  }

  if (!opts.allowUnapproved) {
    if (!opts.approvalId?.trim()) {
      throw new Error(
        "confirm requires --approval-id (approved internal APR) or --allow-unapproved (demo only)"
      );
    }
    const approval = loadOrgApprovalRegistry().approvals.find(
      (a) => a.approval_id === opts.approvalId
    );
    if (!approval) throw new Error(`Approval ${opts.approvalId} not found`);
    if (approval.scope !== "internal") {
      throw new Error(
        `Approval ${opts.approvalId} scope=${approval.scope} — venue_booking uses internal only (not Wire)`
      );
    }
    if (approval.status !== "approved" && approval.status !== "completed") {
      throw new Error(
        `Approval ${opts.approvalId} status=${approval.status} — approve before confirm`
      );
    }
    if (approval.subject_ref && approval.subject_ref !== opts.id) {
      throw new Error(
        `Approval subject_ref=${approval.subject_ref} does not match reservation ${opts.id}`
      );
    }
  }

  const req = venueReservationRequestSchema.parse({
    provider_id: current.provider_id,
    venue_name: current.venue_name,
    area: current.area,
    party_size: current.party_size,
    start_at: current.start_at,
    end_at: current.end_at,
    budget_per_person_jpy: current.budget_per_person_jpy,
    cuisine: current.cuisine,
    notes: current.notes,
    scheduling_case_id: current.scheduling_case_id,
    request_id: current.request_id,
  });

  const adapter = getVenueBookingAdapter(current.provider_id);
  const result = await adapter.confirm(req, {
    externalRef: opts.externalRef ?? current.external_ref,
  });
  if (!result.ok || result.status !== "confirmed") {
    throw new Error(result.message);
  }

  const ts = nowIso();
  const updated: VenueReservation = {
    ...current,
    status: "confirmed",
    external_ref: result.external_ref ?? opts.externalRef,
    approval_id: opts.approvalId ?? current.approval_id,
    adapter_message: result.message,
    confirmed_at: ts,
    updated_at: ts,
  };
  upsertVenueReservation(updated);

  if (updated.scheduling_case_id) {
    const sch = findSchedulingCase(updated.scheduling_case_id);
    if (sch) {
      const linked = updateSchedulingCase(sch.id, sch.revision, (c) =>
        applyNextAction({
          ...c,
          venue_reservation_id: updated.id,
          venue_provider: updated.provider_id,
          exception_reason:
            c.exception_reason === "schedule_venue_reservation_pending"
              ? undefined
              : c.exception_reason,
          updated_at: ts,
        })
      );
      if (linked.next_action === "send_confirmation") {
        ensureSchedulingCorrespondenceDrafts(linked.id, "confirm");
      }
    }
  }

  return updated;
}

export async function cancelVenueReservation(id: string): Promise<VenueReservation> {
  const current = findVenueReservation(id);
  if (!current) throw new Error(`Venue reservation ${id} not found`);
  if (current.status === "cancelled") return current;

  const req = venueReservationRequestSchema.parse({
    provider_id: current.provider_id,
    venue_name: current.venue_name,
    area: current.area,
    party_size: current.party_size,
    start_at: current.start_at,
    end_at: current.end_at,
    request_id: current.request_id,
  });
  const adapter = getVenueBookingAdapter(current.provider_id);
  const result = await adapter.cancel(req, { externalRef: current.external_ref });
  const ts = nowIso();
  const updated: VenueReservation = {
    ...current,
    status: "cancelled",
    adapter_message: result.message,
    cancelled_at: ts,
    updated_at: ts,
  };
  upsertVenueReservation(updated);
  return updated;
}

export async function searchVenueAvailability(opts: VenueReserveOptions) {
  const fields = resolveVenueFields(opts);
  const req = venueReservationRequestSchema.parse({
    provider_id: fields.provider_id,
    venue_name: fields.venue_name,
    area: fields.area,
    party_size: opts.partySize ?? 2,
    start_at: opts.startAt ?? nowIso().slice(0, 16),
    end_at: opts.endAt,
    budget_per_person_jpy: fields.budget_per_person_jpy,
    cuisine: fields.cuisine,
    notes: opts.notes,
    scheduling_case_id: opts.schedulingCaseId,
    request_id: opts.requestId ?? `vb-search-${randomUUID()}`,
  });
  const adapter = getVenueBookingAdapter(req.provider_id);
  return adapter.checkAvailability(req);
}
