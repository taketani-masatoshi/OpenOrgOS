import { z } from "zod";
import { dateString } from "./common.js";

/** ISO 8601 日付または日時（タイムゾーン省略可） */
export const datetimeString = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?)?$/,
    "Datetime must be YYYY-MM-DD or ISO 8601 datetime"
  );

export const calendarEventType = z.enum([
  "meeting",
  "dining",
  "travel",
  "block",
  "one_on_one",
  "external",
]);

export const calendarEventStatus = z.enum([
  "confirmed",
  "tentative",
  "cancelled",
  "tbd",
]);

export const calendarEventSchema = z.object({
  id: z.string().regex(/^EVT-\d{3,}$/),
  title: z.string().min(1),
  type: calendarEventType,
  start: datetimeString,
  end: datetimeString,
  location: z.string().nullable().optional(),
  attendees: z.array(z.string()).default([]),
  status: calendarEventStatus.default("tentative"),
  notes: z.string().optional(),
  external_visible: z.boolean().default(false),
});

export const calendarFileSchema = z.object({
  events: z.array(calendarEventSchema).default([]),
  notes: z.string().optional(),
});

export const taskPriority = z.enum(["p0", "p1", "p2", "p3"]);
export const taskStatus = z.enum([
  "open",
  "in_progress",
  "done",
  "cancelled",
  "deferred",
]);
export const taskCategory = z.enum([
  "personal",
  "business",
  "follow_up",
  "dining",
  "travel",
  "hr",
  "external",
]);

export const executiveTaskSchema = z.object({
  id: z.string().regex(/^TASK-\d{3,}$/),
  title: z.string().min(1),
  due: dateString.nullable().optional(),
  priority: taskPriority.default("p2"),
  status: taskStatus.default("open"),
  category: taskCategory.default("business"),
  delegated_to: z.string().nullable().optional(),
  source: z.string().optional(),
});

export const tasksFileSchema = z.object({
  tasks: z.array(executiveTaskSchema).default([]),
  notes: z.string().optional(),
});

export const oneOnOneCadence = z.enum([
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "ad_hoc",
]);

export const actionItemSchema = z.object({
  text: z.string().min(1),
  owner: z.string().optional(),
  due: dateString.nullable().optional(),
  status: taskStatus.default("open"),
});

export const oneOnOneSchema = z.object({
  id: z.string().regex(/^OOO-\d{3,}$/),
  person: z.string().min(1),
  role: z.string().optional(),
  cadence: oneOnOneCadence.default("monthly"),
  last_date: dateString.nullable().optional(),
  next_date: dateString.nullable().optional(),
  topics: z.array(z.string()).default([]),
  action_items: z.array(actionItemSchema).default([]),
});

export const oneOnOnesFileSchema = z.object({
  one_on_ones: z.array(oneOnOneSchema).default([]),
  notes: z.string().optional(),
});

export const externalContactSchema = z.object({
  id: z.string().regex(/^EXT-\d{3,}$/),
  name: z.string().min(1),
  org: z.string().optional(),
  relationship: z.string().optional(),
  preferred_channel: z.string().optional(),
  notes: z.string().optional(),
});

export const externalContactsFileSchema = z.object({
  contacts: z.array(externalContactSchema).default([]),
  notes: z.string().optional(),
});

export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type CalendarFile = z.infer<typeof calendarFileSchema>;
export type ExecutiveTask = z.infer<typeof executiveTaskSchema>;
export type TasksFile = z.infer<typeof tasksFileSchema>;
export type OneOnOne = z.infer<typeof oneOnOneSchema>;
export type OneOnOnesFile = z.infer<typeof oneOnOnesFileSchema>;
export type ExternalContact = z.infer<typeof externalContactSchema>;
export type ExternalContactsFile = z.infer<typeof externalContactsFileSchema>;
