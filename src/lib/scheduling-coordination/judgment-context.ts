import type {
  SchedulingCase,
  SchedulingCaseInput,
} from "../../../schemas/executive/scheduling-cases.js";
import { findVenueReservation } from "../venue-booking/store.js";
import { applyNextAction } from "./next-action.js";
import { caseNeedsVenueReservationForConfirm } from "./venue-gate.js";

/** Venue reservation facts needed for pure next-action judgment (no I/O). */
export type SchedulingJudgmentContext = {
  /**
   * Loaded reservation for `caseRow.venue_reservation_id`.
   * `null` / omitted means missing or not loaded — treated as unresolved.
   */
  venueReservation?: {
    status: string;
    external_ref?: string | null;
  } | null;
};

export function loadSchedulingJudgmentContext(
  caseRow: Pick<SchedulingCase, "venue_reservation_id">
): SchedulingJudgmentContext {
  const id = caseRow.venue_reservation_id;
  if (!id) return { venueReservation: null };
  const vr = findVenueReservation(id);
  if (!vr) return { venueReservation: null };
  return {
    venueReservation: {
      status: vr.status,
      external_ref: vr.external_ref,
    },
  };
}

/** Shell wrapper: load venue facts then run pure applyNextAction. */
export function resolveNextAction(caseInput: SchedulingCaseInput): SchedulingCase {
  const withId = caseInput as SchedulingCase;
  const ctx = loadSchedulingJudgmentContext({
    venue_reservation_id: withId.venue_reservation_id,
  });
  return applyNextAction(caseInput, ctx);
}

/**
 * Shell: load VR from store then evaluate confirm gate (pure gate stays I/O-free).
 */
export function resolveCaseNeedsVenueReservationForConfirm(
  caseRow: Pick<
    SchedulingCase,
    "meeting_format" | "status" | "venue_reservation_id" | "location"
  >
): boolean {
  const ctx = loadSchedulingJudgmentContext(caseRow);
  return caseNeedsVenueReservationForConfirm(caseRow, ctx.venueReservation);
}
