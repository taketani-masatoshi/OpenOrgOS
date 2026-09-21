/**
 * Property Operations Dashboard — MAL Bancho / Kamezawa L1 surface.
 * ADR: docs/adr/0072-property-ops-dashboard.md
 */
import { z } from "zod";

export const propertyOpsSeveritySchema = z.enum(["p0", "p1", "p2"]);

export const propertyOpsDueRowSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  due_on: z.string(),
  severity: propertyOpsSeveritySchema,
  href: z.string(),
});

export const propertyOpsInsuranceRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string().optional(),
  renews_on: z.string().optional(),
  severity: propertyOpsSeveritySchema.optional(),
});

export const propertyOpsPermitRowSchema = z.object({
  id: z.string(),
  permit_type_id: z.string(),
  status: z.string(),
  issued_on: z.string().optional(),
  expires_on: z.string().optional(),
  severity: propertyOpsSeveritySchema.optional(),
});

export const propertyOpsBulletinRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  path: z.string(),
  present: z.boolean(),
  href: z.string().optional(),
});

export const propertyOpsFinanceSchema = z.object({
  monthly_revenue: z.number().nullable().optional(),
  annual_revenue: z.number().nullable().optional(),
  noi: z.number().nullable().optional(),
  monthly_rent: z.number().nullable().optional(),
  vacancy_rate: z.number().nullable().optional(),
  occupancy: z.number().nullable().optional(),
  adr: z.number().nullable().optional(),
  revpar: z.number().nullable().optional(),
  stay_count: z.number().int().nonnegative().optional(),
});

export const propertyOpsRegisterSchema = z.object({
  row_count: z.number().int().nonnegative(),
  issue_count: z.number().int().nonnegative(),
  error_count: z.number().int().nonnegative(),
  ok: z.boolean(),
  href: z.string(),
});

export const propertyOpsFacilitySchema = z.object({
  check_in: z.string().optional(),
  check_out: z.string().optional(),
  max_guests: z.number().int().positive().optional(),
});

export const propertyOpsCardSchema = z.object({
  property_id: z.string(),
  name: z.string(),
  location: z.string(),
  type: z.enum(["rental", "hotel", "mixed"]),
  module_ids: z.array(z.string()),
  due: z.array(propertyOpsDueRowSchema),
  due_p0: z.number().int().nonnegative(),
  insurance: z.array(propertyOpsInsuranceRowSchema),
  permits: z.array(propertyOpsPermitRowSchema),
  bulletins: z.array(propertyOpsBulletinRowSchema),
  finance: propertyOpsFinanceSchema,
  register: propertyOpsRegisterSchema.optional(),
  facility: propertyOpsFacilitySchema.optional(),
  open_tasks: z.number().int().nonnegative(),
  href: z.string(),
  next_actions: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        href: z.string(),
      }),
    )
    .default([]),
});

export const propertyOpsDashboardSchema = z.object({
  ok: z.literal(true),
  tenant: z.string(),
  report_date: z.string(),
  company_name: z.string(),
  properties: z.array(propertyOpsCardSchema),
});

export type PropertyOpsDashboard = z.infer<typeof propertyOpsDashboardSchema>;
export type PropertyOpsCard = z.infer<typeof propertyOpsCardSchema>;
export type PropertyOpsDueRow = z.infer<typeof propertyOpsDueRowSchema>;
export type PropertyOpsInsuranceRow = z.infer<typeof propertyOpsInsuranceRowSchema>;
export type PropertyOpsPermitRow = z.infer<typeof propertyOpsPermitRowSchema>;
export type PropertyOpsBulletinRow = z.infer<typeof propertyOpsBulletinRowSchema>;
