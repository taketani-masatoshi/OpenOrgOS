import { z } from "zod";

export const invoiceTemplateSchema = z.object({
  id: z.string(),
  module: z.string(),
  description: z.string().optional(),
  pdf: z.object({
    title: z.string().default("請 求 書"),
    line_label: z.string(),
    line_note: z.string().optional(),
    tax_label: z.string().default("消費税（10%）"),
    tax_note: z.string().optional(),
    tax_mode: z.enum(["non_taxable", "taxable_10"]).default("non_taxable"),
    lodging_tax_label: z.string().optional(),
    footer_notes: z.string().optional(),
  }),
  email: z.object({
    subject: z.string(),
    body_template: z.string().optional(),
  }),
  defaults: z
    .object({
      sender_email: z.string().optional(),
      tenant_name: z.string().optional(),
      tenant_email: z.string().optional(),
      bank_account: z.string().optional(),
    })
    .optional(),
});

export type InvoiceTemplate = z.output<typeof invoiceTemplateSchema>;
