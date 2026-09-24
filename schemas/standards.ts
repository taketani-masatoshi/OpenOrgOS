import { z } from "zod";

export const iso3166Alpha2Schema = z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2 required");
export const iso3166Alpha3Schema = z.string().regex(/^[A-Z]{3}$/, "ISO 3166-1 alpha-3 required");
export const iso3166Numeric3Schema = z.string().regex(/^\d{3}$/, "ISO 3166-1 numeric-3 required");
export const iso3166SubdivisionSchema = z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/, "ISO 3166-2 required");

export const e164PhoneSchema = z.string().regex(/^\+[1-9]\d{6,14}$/, "ITU-T E.164 phone number required");
export const iso8601DateTimeSchema = z.string().datetime({ offset: true });
export const iso639Schema = z.string().regex(/^[a-z]{2,3}$/, "ISO 639 language code required");
export const bcp47Schema = z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, "BCP 47 language tag required");

export const ibanSchema = z.string().transform((value) => value.replace(/\s/g, "").toUpperCase()).refine((value) => {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) return false;
  const rearranged = `${value.slice(4)}${value.slice(0, 4)}`;
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}, "Invalid ISO 13616 IBAN");

export const bicSchema = z.string().regex(/^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/, "ISO 9362 BIC required");
export const leiSchema = z.string().regex(/^[A-Z0-9]{18}\d{2}$/, "ISO 17442 LEI required");
export const unLocodeSchema = z.string().regex(/^[A-Z]{2}[A-Z0-9]{3}$/, "UN/LOCODE required");

export const postalCodeByCountry: Record<string, RegExp> = {
  JP: /^\d{3}-?\d{4}$/,
  US: /^\d{5}(?:-\d{4})?$/,
  GB: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
  DE: /^\d{5}$/,
  FR: /^\d{5}$/,
};

export function isPostalCode(countryCode: string, postalCode: string): boolean {
  const rule = postalCodeByCountry[countryCode.toUpperCase()];
  return rule ? rule.test(postalCode.trim()) : postalCode.trim().length > 0;
}

export const standardAddressSchema = z.object({
  country_code: iso3166Alpha2Schema,
  subdivision_code: iso3166SubdivisionSchema.optional(),
  postal_code: z.string().min(1),
  un_locode: unLocodeSchema.optional(),
}).superRefine((value, ctx) => {
  if (!isPostalCode(value.country_code, value.postal_code)) ctx.addIssue({ code: "custom", path: ["postal_code"], message: "Invalid postal code for country" });
  if (value.subdivision_code && !value.subdivision_code.startsWith(`${value.country_code}-`)) ctx.addIssue({ code: "custom", path: ["subdivision_code"], message: "Subdivision country prefix mismatch" });
  if (value.un_locode && !value.un_locode.startsWith(value.country_code)) ctx.addIssue({ code: "custom", path: ["un_locode"], message: "UN/LOCODE country prefix mismatch" });
});
