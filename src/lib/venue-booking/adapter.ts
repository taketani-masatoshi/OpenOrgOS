import type {
  VenueProviderId,
  VenueReservationRequest,
} from "../../../schemas/venue-booking.js";

export interface VenueAdapterAvailability {
  available: boolean | "unknown";
  message: string;
  search_url?: string;
  deep_link_url?: string;
}

export interface VenueAdapterHoldResult {
  ok: boolean;
  status: "held" | "pending_manual" | "failed";
  external_ref?: string;
  hold_expires_at?: string;
  deep_link_url?: string;
  search_url?: string;
  message: string;
}

export interface VenueAdapterConfirmResult {
  ok: boolean;
  status: "confirmed" | "pending_manual" | "failed";
  external_ref?: string;
  message: string;
}

export interface VenueAdapterCancelResult {
  ok: boolean;
  message: string;
}

/**
 * Venue booking adapter — HTTP/API or deep-link only.
 * Must NOT use Wire / protocol peer transport.
 */
export interface VenueBookingAdapter {
  readonly providerId: VenueProviderId;
  checkAvailability(req: VenueReservationRequest): Promise<VenueAdapterAvailability>;
  hold(req: VenueReservationRequest): Promise<VenueAdapterHoldResult>;
  confirm(
    req: VenueReservationRequest,
    opts?: { externalRef?: string }
  ): Promise<VenueAdapterConfirmResult>;
  cancel(
    req: VenueReservationRequest,
    opts?: { externalRef?: string }
  ): Promise<VenueAdapterCancelResult>;
}

export function buildHotpepperSearchUrl(req: VenueReservationRequest): string {
  const params = new URLSearchParams({
    keyword: `${req.area} ${req.venue_name}`.trim(),
    freeword: req.cuisine ?? "和食",
  });
  return `https://www.hotpepper.jp/strlist/?${params.toString()}`;
}

export function buildTabelogSearchUrl(req: VenueReservationRequest): string {
  const q = encodeURIComponent(`${req.area} ${req.venue_name}`);
  return `https://tabelog.com/rstLst/?sw=${q}`;
}

export function buildGenericSearchUrl(req: VenueReservationRequest): string {
  const q = encodeURIComponent(`${req.venue_name} ${req.area} 予約`);
  return `https://www.google.com/search?q=${q}`;
}
