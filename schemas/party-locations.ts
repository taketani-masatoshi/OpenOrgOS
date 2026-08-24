import { z } from "zod";

/**
 * Party location anchors for venue / meeting-place suggestions.
 * L1 only: station · area labels — never street/home address text.
 * Full personal addresses stay in Zone C records (L2) and are not linked here.
 */
export const partyLocationRoleSchema = z.enum([
  "office",
  "home_commute",
  "usual_area",
]);

export const partyLocationKindSchema = z.enum([
  "self_company",
  "self_operator",
  "counterparty_org",
  "counterparty_contact",
  "stakeholder",
]);

export const partyLocationAnchorSchema = z.object({
  id: z.string().regex(/^LOC-PARTY-[A-Za-z0-9_-]+$/),
  party_kind: partyLocationKindSchema,
  role: partyLocationRoleSchema,
  /** Nearest station label (L1 public) */
  station: z.string().min(1),
  /** Area / neighborhood label (L1) — not street address */
  area: z.string().min(1).optional(),
  /** Match scheduling participant email (exact) */
  email: z.string().email().optional(),
  /** Match external contact / org name substring */
  org_hint: z.string().min(1).optional(),
  /** Match EXT-### or STK-### */
  contact_ref: z.string().min(1).optional(),
  operator_id: z.string().min(1).optional(),
  /** Email domain without @ — e.g. southwood.co.jp */
  email_domains: z.array(z.string().min(1)).default([]),
  /**
   * Relative weight when scoring daytime vs evening meetings.
   * Evening meals often weight home_commute higher than office.
   */
  weight_day: z.number().positive().default(1),
  weight_evening: z.number().positive().default(1),
  notes: z.string().optional(),
});

export const partyLocationsFileSchema = z.object({
  version: z.literal(1).default(1),
  /**
   * Deterministic station→cluster map overrides (optional).
   * Unknown stations fall back to area string or "other".
   */
  station_clusters: z.record(z.string(), z.string()).default({}),
  parties: z.array(partyLocationAnchorSchema).default([]),
});

export type PartyLocationRole = z.output<typeof partyLocationRoleSchema>;
export type PartyLocationKind = z.output<typeof partyLocationKindSchema>;
export type PartyLocationAnchor = z.output<typeof partyLocationAnchorSchema>;
export type PartyLocationsFile = z.output<typeof partyLocationsFileSchema>;
