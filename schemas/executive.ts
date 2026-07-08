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
  /** Google Calendar event id（push 後 · gitignore 正本のみ） */
  google_event_id: z.string().optional(),
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
  "archived",
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
  /** 詳細は gitignore の stakeholders.yaml へ */
  stakeholder_id: z.string().regex(/^STK-\d{3,}$/).optional(),
  notes: z.string().optional(),
});

export const piiLevelSchema = z.enum(["L0", "L1", "L2"]);

export const stakeholderContactSchema = z.object({
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  chat: z.string().nullable().optional(),
});

export const stakeholderSchema = z.object({
  id: z.string().regex(/^STK-\d{3,}$/),
  name: z.string().min(1),
  name_en: z.string().optional(),
  org: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  relationship: z.array(z.string()).default([]),
  primary_agent: z.string().optional(),
  secondary_agents: z.array(z.string()).default([]),
  contract_ids: z.array(z.string()).default([]),
  pii_level: piiLevelSchema.default("L1"),
  preferred_channel: z.string().optional(),
  /** リポジトリルートからの相対パス（gitignore 想定） */
  profile_md: z.string().optional(),
  contact: stakeholderContactSchema.optional(),
  background_summary: z.string().optional(),
  notes: z.string().optional(),
});

export const stakeholdersFileSchema = z.object({
  stakeholders: z.array(stakeholderSchema).default([]),
  notes: z.string().optional(),
});

export const externalContactsFileSchema = z.object({
  contacts: z.array(externalContactSchema).default([]),
  notes: z.string().optional(),
});

export type CalendarEvent = z.output<typeof calendarEventSchema>;
export type CalendarFile = z.output<typeof calendarFileSchema>;
export type ExecutiveTask = z.output<typeof executiveTaskSchema>;
export type TasksFile = z.output<typeof tasksFileSchema>;
export type OneOnOne = z.output<typeof oneOnOneSchema>;
export type OneOnOnesFile = z.output<typeof oneOnOnesFileSchema>;
export type ExternalContact = z.output<typeof externalContactSchema>;
export type ExternalContactsFile = z.output<typeof externalContactsFileSchema>;
export type Stakeholder = z.output<typeof stakeholderSchema>;
export type StakeholdersFile = z.output<typeof stakeholdersFileSchema>;
