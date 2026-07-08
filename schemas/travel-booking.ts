import { z } from "zod";

export const tripTypeSchema = z.enum(["hotel", "flight", "shinkansen", "package"]);
export const portalIdSchema = z.enum(["rakuten-travel", "booking-com", "trip-com"]);
export const travelRoleSchema = z.enum(["executive", "employee"]);
export const draftStatusSchema = z.enum(["draft", "dry-run", "awaiting_payment", "booked"]);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const travelPortalSchema = z.object({
  id: portalIdSchema,
  name: z.string(),
  url: z.string().url(),
  login_url: z.string().url(),
  login_id: z.string(),
  supported_trip_types: z.array(tripTypeSchema),
  notes: z.string().optional(),
});

export const travelPortalsFileSchema = z.object({
  portals: z.array(travelPortalSchema).min(1),
  default_portal: portalIdSchema,
});

export const travelBookingRequestSchema = z.object({
  portal_id: portalIdSchema,
  trip_type: tripTypeSchema.default("hotel"),
  destination: z.string().min(1),
  destination_area: z.string().min(1),
  check_in: isoDate,
  check_out: isoDate,
  guests: z.number().int().min(1).default(1),
  budget_max: z.number().int().positive().optional(),
  trip_purpose: z.string().optional(),
  room_preference: z.string().optional(),
  traveler_role: travelRoleSchema.default("executive"),
  status: draftStatusSchema.default("draft"),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
});

export type TripType = z.output<typeof tripTypeSchema>;
export type PortalId = z.output<typeof portalIdSchema>;
export type TravelRole = z.output<typeof travelRoleSchema>;
export type DraftStatus = z.output<typeof draftStatusSchema>;
export type TravelPortal = z.output<typeof travelPortalSchema>;
export type TravelPortalsFile = z.output<typeof travelPortalsFileSchema>;
export type TravelBookingRequest = z.output<typeof travelBookingRequestSchema>;

export const REG008_LODGING_LIMITS: Record<TravelRole, number> = {
  executive: 15_000,
  employee: 12_000,
};
