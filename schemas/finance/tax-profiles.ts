import { z } from "zod";
import { dateString, monthString } from "../common.js";
export const taxProfileEntitySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  corporate_number: z.string().optional(),
  address: z.string().optional(),
});

export const taxProfileFiscalYearSchema = z.object({
  end_month: z.number().int().min(1).max(12),
  label: z.string().optional(),
  period_from: dateString.optional(),
  period_to: dateString.optional(),
  calendar_note: z.string().optional(),
});

export const taxProfileConsumptionTaxSchema = z.object({
  status: z.union([z.literal("TBD"), z.string()]),
  options: z.array(z.string()).optional(),
  invoice_registration_number: z.string().optional(),
  invoice_registered: z.boolean().optional(),
  base_period_sales_threshold: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export const taxProfileCorporateTaxSchema = z.object({
  category: z.string().optional(),
  applicable_rates: z.record(z.string()).optional(),
  capital_stock: z.union([z.literal("TBD"), z.number().nonnegative()]).optional(),
  prior_retained_earnings: z.union([z.literal("TBD"), z.number()]).optional(),
  estimated_tax_fy2026: z.number().nonnegative().optional(),
  estimated_tax_status: z.string().optional(),
  notes: z.string().optional(),
});

export const taxProfileFilingCalendarItemSchema = z.object({
  id: z.string().min(1),
  tax: z.string().min(1),
  authority: z.string().optional(),
  deadline: dateString.optional(),
  status: z.union([z.literal("TBD"), z.string()]).optional(),
  attachments: z.array(z.string()).optional(),
  note: z.string().optional(),
});

export const taxProfileSchema = z.object({
  entity: taxProfileEntitySchema,
  fiscal_year: taxProfileFiscalYearSchema,
  consumption_tax: taxProfileConsumptionTaxSchema,
  corporate_tax: taxProfileCorporateTaxSchema,
  local_tax: z
    .object({
      prefecture: z.string().optional(),
      municipalities: z
        .array(
          z.object({
            name: z.string(),
            assets: z.array(z.string()).optional(),
            taxes: z.array(z.string()).optional(),
          })
        )
        .optional(),
      notes: z.string().optional(),
    })
    .optional(),
  filing_calendar: z.array(taxProfileFilingCalendarItemSchema).default([]),
  contacts: z.record(z.union([z.string(), z.record(z.string())])).optional(),
  related_docs: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const taxProfileUsFederalSchema = z.object({
  corporate_rate: z.string().optional(),
  estimated_payments: z.string().optional(),
  notes: z.string().optional(),
});

export const taxProfileUsStateSchema = z.object({
  state_of_incorporation: z.string().optional(),
  franchise_tax: z.string().optional(),
  notes: z.string().optional(),
});

export const taxProfileUsEntitySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  ein: z.string().optional(),
  state_of_incorporation: z.string().optional(),
  registered_office: z.string().optional(),
});

export const taxProfileUsSchema = z.object({
  entity: taxProfileUsEntitySchema,
  fiscal_year: taxProfileFiscalYearSchema,
  federal_tax: taxProfileUsFederalSchema,
  state_tax: taxProfileUsStateSchema,
  sales_tax: z
    .object({
      nexus_states: z.array(z.string()).optional(),
      notes: z.string().optional(),
    })
    .optional(),
  filing_calendar: z.array(taxProfileFilingCalendarItemSchema).default([]),
  contacts: z.record(z.union([z.string(), z.record(z.string())])).optional(),
  related_docs: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const taxProfileCorporateEntitySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  registration_id: z.string().optional(),
  registered_office: z.string().optional(),
});

export const taxProfileCorporateSchema = z.object({
  entity: taxProfileCorporateEntitySchema,
  fiscal_year: taxProfileFiscalYearSchema,
  corporate_tax: z
    .object({
      headline_rate: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  indirect_tax: z
    .object({
      type: z.string().optional(),
      rate: z.string().optional(),
      registration_id: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  filing_calendar: z.array(taxProfileFilingCalendarItemSchema).default([]),
  contacts: z.record(z.union([z.string(), z.record(z.string())])).optional(),
  related_docs: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
