import { z } from "zod";
import { dateString } from "../common.js";

export const customerContactSchema = z.object({
  id: z.string().regex(/^CONTACT-\d{4}-\d{3}$/),
  account_id: z.string().regex(/^CUST-\d{4}-\d{3}$/),
  name: z.string().min(1),
  title: z.string().min(1).optional(),
  /** Business email — not exposed in Chat / Console L1 API */
  email: z.string().min(1).optional(),
  /** Company switchboard / published desk line */
  phone: z.string().min(1).optional(),
  primary: z.boolean().optional(),
  notes: z.string().min(1).optional(),
  last_contact_on: dateString.optional(),
  demo: z.boolean().optional(),
});

export type CustomerContact = z.output<typeof customerContactSchema>;

export const customerContactsFileSchema = z.object({
  version: z.literal(1),
  updated_at: z.string().min(1).optional(),
  contacts: z.array(customerContactSchema),
});

export type CustomerContactsFile = z.output<typeof customerContactsFileSchema>;
