/**
 * Priority mappers for executive task intake / candidate views.
 * Intake triage and candidate triage intentionally differ — keep separate names.
 */

import type { TaskPriority } from "../../../schemas/executive.js";

/** Work-order handoff priority (P0–P3) → TaskPriority. */
export function workOrderTaskPriority(
  p: "P0" | "P1" | "P2" | "P3" | undefined,
): TaskPriority {
  if (p === "P0") return "p0";
  if (p === "P1") return "p1";
  if (p === "P3") return "p3";
  return "p2";
}

/**
 * Intake-from-triage: only explicit p0/p1 importance; otherwise p2.
 * (Does not elevate by urgency.)
 */
export function triageIntakePriority(
  importance: string | undefined,
): TaskPriority {
  return importance === "p0" || importance === "p1" ? importance : "p2";
}

/**
 * Candidate-list triage: p0/p1 importance, else urgency immediate/today → p1, else p2.
 */
export function triageCandidatePriority(
  importance: string | undefined,
  urgency: string | undefined,
): TaskPriority {
  if (importance === "p0" || importance === "p1") return importance;
  if (urgency === "immediate" || urgency === "today") return "p1";
  return "p2";
}
