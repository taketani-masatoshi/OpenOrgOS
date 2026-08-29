/**
 * Co-located Zod contract for the clinic activation seeds.
 * Mirrors `steward/modules/clinic/seed/*.yaml.example`.
 */

import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clockTime = z.string().regex(/^\d{2}:\d{2}$/);

export const clinicAppointmentSchema = z.object({
  id: z.string().min(1),
  patient_id: z.string().min(1).optional(),
  department_id: z.string().min(1).optional(),
  date: isoDate.optional(),
  time: clockTime.optional(),
  status: z.string().min(1),
  notes: z.string().optional(),
});

export const clinicAppointmentsFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  appointments: z.array(clinicAppointmentSchema).default([]),
});

export const clinicDepartmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slots_per_day: z.number().int().nonnegative().optional(),
  status: z.string().min(1).optional(),
});

export const clinicDepartmentsFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  departments: z.array(clinicDepartmentSchema).default([]),
});

export type ClinicAppointment = z.output<typeof clinicAppointmentSchema>;
export type ClinicDepartment = z.output<typeof clinicDepartmentSchema>;
export type ClinicAppointmentsFile = z.output<typeof clinicAppointmentsFileSchema>;
export type ClinicDepartmentsFile = z.output<typeof clinicDepartmentsFileSchema>;
