/** 宿泊者名簿 — 法定フィールド最小契約（旅館業法第6条 · guest-register-rules §2） */

export const GUEST_REGISTER_REQUIRED_COLUMNS = [
  "guest_name",
  "address",
  "occupation",
  "check_in_date",
  "check_out_date",
] as const;

/** 国内住所を持たない外国籍宿泊者で必須 */
export const GUEST_REGISTER_FOREIGN_COLUMNS = [
  "nationality",
  "passport_or_id_number",
] as const;

export const GUEST_REGISTER_OPTIONAL_COLUMNS = [
  "age",
  "gender",
  "phone",
  "email",
  "previous_stay",
  "next_destination",
  "guest_count",
  "booking_channel",
  "reservation_id",
  "notes",
  "stay_id",
] as const;

export const GUEST_REGISTER_ALL_KNOWN_COLUMNS = [
  ...GUEST_REGISTER_REQUIRED_COLUMNS,
  ...GUEST_REGISTER_FOREIGN_COLUMNS,
  ...GUEST_REGISTER_OPTIONAL_COLUMNS,
] as const;

/** REG-010 SSOT — 法定3年は下限 */
export const GUEST_REGISTER_RETENTION_YEARS = 5;

export const GUEST_REGISTER_FILENAME = "宿泊者名簿.csv";

export type GuestRegisterRequiredColumn = (typeof GUEST_REGISTER_REQUIRED_COLUMNS)[number];
export type GuestRegisterForeignColumn = (typeof GUEST_REGISTER_FOREIGN_COLUMNS)[number];
