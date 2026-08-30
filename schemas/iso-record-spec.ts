import { z } from "zod";

/**
 * What a pack demands of the records a tenant keeps.
 *
 * Checking that an evidence file exists says nothing about whether it satisfies
 * the requirement it stands for. A spec lets the pack state the structure and
 * internal consistency an auditor would look for, so the gap between "a file is
 * there" and "the record holds up" can be closed deterministically.
 *
 * The rule vocabulary is deliberately closed — no expression language. Anything
 * a rule cannot express belongs in the auditor's judgement, not in a DSL that
 * grows until nobody can predict what it does.
 */

export const isoRecordKind = z.enum(["csv", "markdown", "yaml"]);

export const isoRecordColumnType = z.enum(["text", "number", "date", "month"]);

export const isoRecordSeverity = z.enum(["error", "warning"]);

export const isoRecordColumnSchema = z.object({
  name: z.string().min(1),
  type: isoRecordColumnType.default("text"),
  /** A row is incomplete without it. */
  required: z.boolean().default(false),
  pattern: z.string().optional(),
  /** Closed value set, e.g. open / closed. */
  values: z.array(z.string().min(1)).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  note: z.string().optional(),
});

const ruleBase = {
  /** Shown to the operator when the rule fires. */
  message: z.string().min(1),
  severity: isoRecordSeverity.default("error"),
};

/** `target` must equal the product (or sum) of `factors`. */
const computedRule = z.object({
  kind: z.literal("computed"),
  target: z.string().min(1),
  operation: z.enum(["product", "sum"]),
  factors: z.array(z.string().min(1)).min(2),
  ...ruleBase,
});

/** When `column` holds one of `equals`, the `require` columns must be filled. */
const conditionalRule = z.object({
  kind: z.literal("conditional_required"),
  column: z.string().min(1),
  equals: z.array(z.string()).min(1),
  require: z.array(z.string().min(1)).min(1),
  ...ruleBase,
});

/** Numeric or date ordering between two columns of the same row. */
const comparisonRule = z.object({
  kind: z.literal("comparison"),
  left: z.string().min(1),
  operator: z.enum(["lte", "lt", "gte", "gt"]),
  right: z.string().min(1),
  ...ruleBase,
});

/** A dated record goes stale; an auditor treats an old review as no review. */
const freshnessRule = z.object({
  kind: z.literal("freshness"),
  column: z.string().min(1),
  max_age_days: z.number().int().positive(),
  ...ruleBase,
});

const uniqueRule = z.object({
  kind: z.literal("unique"),
  columns: z.array(z.string().min(1)).min(1),
  ...ruleBase,
});

/** The record must carry at least one row — an empty register is not evidence. */
const nonEmptyRule = z.object({
  kind: z.literal("non_empty"),
  ...ruleBase,
});

/** Markdown headings the form must keep once the tenant fills it in. */
const sectionRule = z.object({
  kind: z.literal("required_sections"),
  headings: z.array(z.string().min(1)).min(1),
  ...ruleBase,
});

/** Unreplaced `{PLACEHOLDER}` tokens mean the form was never filled in. */
const noPlaceholderRule = z.object({
  kind: z.literal("no_placeholders"),
  ...ruleBase,
});

export const isoRecordRuleSchema = z.discriminatedUnion("kind", [
  computedRule,
  conditionalRule,
  comparisonRule,
  freshnessRule,
  uniqueRule,
  nonEmptyRule,
  sectionRule,
  noPlaceholderRule,
]);

export const isoRecordSpecSchema = z.object({
  /** File name inside `docs/compliance/iso/<ID>/`, unless `tenant_path` is set. */
  file: z.string().min(1),
  kind: isoRecordKind,
  title: z.string().min(1),
  /** Tenant-relative path override (e.g. a module ledger outside the ISO folder). */
  tenant_path: z.string().min(1).optional(),
  /** YAML list key checked by `non_empty` (default `entries`). */
  list_key: z.string().min(1).optional(),
  columns: z.array(isoRecordColumnSchema).default([]),
  rules: z.array(isoRecordRuleSchema).default([]),
  note: z.string().optional(),
});

export const isoRecordSpecFileSchema = z.object({
  version: z.string().default("1"),
  standard: z.string().min(1),
  records: z.array(isoRecordSpecSchema).default([]),
});

export type IsoRecordKind = z.output<typeof isoRecordKind>;
export type IsoRecordColumnType = z.output<typeof isoRecordColumnType>;
export type IsoRecordSeverity = z.output<typeof isoRecordSeverity>;
export type IsoRecordColumn = z.output<typeof isoRecordColumnSchema>;
export type IsoRecordRule = z.output<typeof isoRecordRuleSchema>;
export type IsoRecordSpec = z.output<typeof isoRecordSpecSchema>;
export type IsoRecordSpecFile = z.output<typeof isoRecordSpecFileSchema>;
