import { z } from "zod";

export const facilityAddressSchema = z.object({
  prefecture: z.string().min(1),
  city: z.string().min(1),
  chome: z.string().min(1),
  display_ja: z.string().min(1),
  display_en: z.string().min(1),
  landmark_ja: z.string().optional(),
  map_url: z.string().url().optional(),
});

export const facilityAccessSchema = z.object({
  station_ja: z.string().min(1),
  station_en: z.string().min(1),
  exit: z.string().optional(),
  walk_minutes: z.number().int().nonnegative().optional(),
});

export const facilityContactSchema = z.object({
  email: z.string().email().optional(),
  ota: z.string().optional(),
  emergency_note: z.string().optional(),
});

export const facilityPublicSchema = z.object({
  property_id: z.string().regex(/^PROP-\d{3,}$/),
  name: z.string().min(1),
  address: facilityAddressSchema,
  access: facilityAccessSchema,
  check_in: z.string().min(1),
  check_out: z.string().min(1),
  max_guests: z.number().int().positive(),
  contact: facilityContactSchema,
  guest_docs: z
    .object({
      house_rules_en: z.string().optional(),
      local_guide_en: z.string().optional(),
      welcome_sheet: z.string().optional(),
    })
    .optional(),
  notes: z.string().optional(),
});

export type FacilityPublic = z.output<typeof facilityPublicSchema>;

export const facilitySecretsSchema = z.object({
  smart_lock_code: z.string().min(1),
  wifi_ssid: z.string().min(1),
  wifi_password: z.string().min(1),
  host_phone_24h: z.string().min(1),
  host_phone_backup: z.string().min(1),
  cleaning_vendor_line: z.string().min(1),
  cleaning_vendor_phone: z.string().optional(),
  extinguisher_location: z.string().min(1),
  breaker_location: z.string().min(1),
  water_shutoff: z.string().min(1),
  gas_meter_location: z.string().optional(),
  first_aid_location: z.string().optional(),
  emergency_contact_property_mgmt: z.string().optional(),
  ota_backup_contact: z.string().optional(),
  notes: z.string().optional(),
});

export type FacilitySecrets = z.output<typeof facilitySecretsSchema>;
