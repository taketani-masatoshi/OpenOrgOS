import { z } from "zod";
import { dateString } from "./common.js";

export const employeeStatus = z.enum(["active", "inactive", "leave"]);

export const employeeSchema = z.object({
  id: z.string().regex(/^EMP-\d{3,}$/),
  name: z.string().min(1),
  hired_date: dateString.nullable().optional(),
  job_type: z.string().nullable().optional(),
  status: employeeStatus.default("inactive"),
  contract_id: z
    .string()
    .regex(/^CTR-\d{3,}$/)
    .optional(),
});

export const employeesFileSchema = z.object({
  employees: z.array(employeeSchema).default([]),
  notes: z.string().optional(),
});

export type Employee = z.output<typeof employeeSchema>;
export type EmployeesFile = z.output<typeof employeesFileSchema>;
