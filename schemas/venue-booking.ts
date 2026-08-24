import { z } from "zod";
import { datetimeString } from "./executive.js";

/** Transport channel — never Wire / protocol peer transport */
export const VENUE_BOOKING_CHANNEL = "venue_booking" as const;

export const venueProviderIdSchema = z.enum([
  "manual",
  "hotpepper_deep_link",
  "tabelog_deep_link",
  /** Recruit gourmet search API (search only · no book) */
  "hotpepper_api",
  /** Deep-link candidates */
  "ikyu_restaurant",
  "pocket_concierge",
  "ozmall",
  "retty",
  "hitosara",
  /** Partner book candidates */
  "gnavi_search",
  "gnavi_reserve",
  "tablecheck",
  "opentable",
]);

export const venueReservationStatusSchema = z.enum([
  "draft",
  "availability_checked",
  "pending_manual",
  "held",
  "confirmed",
  "cancelled",
  "failed",
]);

export const venueProviderSchema = z.object({
  id: venueProviderIdSchema,
  name: z.string().min(1),
  /** Official site or search entry URL (public) */
  base_url: z.string().url(),
  supports_api: z.boolean().default(false),
  supports_deep_link: z.boolean().default(true),
  notes: z.string().optional(),
});

export const venueProvidersFileSchema = z.object({
  version: z.literal(1).default(1),
  channel: z.literal(VENUE_BOOKING_CHANNEL).default(VENUE_BOOKING_CHANNEL),
  providers: z.array(venueProviderSchema).min(1),
  default_provider: venueProviderIdSchema.default("manual"),
});

export const venueReservationRequestSchema = z.object({
  provider_id: venueProviderIdSchema,
  venue_name: z.string().min(1),
  area: z.string().min(1),
  party_size: z.number().int().positive().default(2),
  start_at: datetimeString,
  end_at: datetimeString.optional(),
  budget_per_person_jpy: z.number().int().positive().optional(),
  cuisine: z.string().optional(),
  notes: z.string().optional(),
  scheduling_case_id: z.string().regex(/^SCH-\d{4}-\d{3}$/).optional(),
  /** Client-generated idempotency key for adapter calls */
  request_id: z.string().min(8).optional(),
});

export const venueReservationSchema = z.object({
  id: z.string().regex(/^VR-\d{4}-\d{3}$/),
  channel: z.literal(VENUE_BOOKING_CHANNEL).default(VENUE_BOOKING_CHANNEL),
  status: venueReservationStatusSchema.default("draft"),
  provider_id: venueProviderIdSchema,
  venue_name: z.string().min(1),
  area: z.string().min(1),
  party_size: z.number().int().positive(),
  start_at: datetimeString,
  end_at: datetimeString.optional(),
  budget_per_person_jpy: z.number().int().positive().optional(),
  cuisine: z.string().optional(),
  scheduling_case_id: z.string().optional(),
  request_id: z.string(),
  /** Provider confirmation / booking number (after human or API confirm) */
  external_ref: z.string().optional(),
  hold_expires_at: z.string().optional(),
  deep_link_url: z.string().url().optional(),
  search_url: z.string().url().optional(),
  adapter_message: z.string().optional(),
  approval_id: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  confirmed_at: z.string().optional(),
  cancelled_at: z.string().optional(),
  notes: z.string().optional(),
});

export const venueReservationsFileSchema = z.object({
  version: z.literal(1).default(1),
  channel: z.literal(VENUE_BOOKING_CHANNEL).default(VENUE_BOOKING_CHANNEL),
  reservations: z.array(venueReservationSchema).default([]),
});

export const venueCatalogEntrySchema = z.object({
  id: z.string().regex(/^VENUE-\d{3}$/),
  name: z.string().min(1),
  area: z.string().min(1),
  provider_id: venueProviderIdSchema.default("manual"),
  walking_minutes_from_station: z.number().int().nonnegative().optional(),
  station: z.string().optional(),
  private_room: z.boolean().optional(),
  typical_budget_jpy: z.number().int().positive().optional(),
  booking_url: z.string().url().optional(),
  notes: z.string().optional(),
});

export const venueCatalogFileSchema = z.object({
  version: z.literal(1).default(1),
  venues: z.array(venueCatalogEntrySchema).default([]),
});

export type VenueProviderId = z.output<typeof venueProviderIdSchema>;
export type VenueReservationStatus = z.output<typeof venueReservationStatusSchema>;
export type VenueProvider = z.output<typeof venueProviderSchema>;
export type VenueProvidersFile = z.output<typeof venueProvidersFileSchema>;
export type VenueReservationRequest = z.output<typeof venueReservationRequestSchema>;
export type VenueReservationRequestInput = z.input<typeof venueReservationRequestSchema>;
export type VenueReservation = z.output<typeof venueReservationSchema>;
export type VenueReservationsFile = z.output<typeof venueReservationsFileSchema>;
export type VenueCatalogEntry = z.output<typeof venueCatalogEntrySchema>;
export type VenueCatalogFile = z.output<typeof venueCatalogFileSchema>;
