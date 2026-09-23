import type { BreachIncident } from "../../../../../../schemas/jp-data-breach.js";

/** L2 混入ガード — data_items はカテゴリ名のみ（メールアドレス・電話/カード番号等の実値を拒否） */
const PERSONAL_VALUE_PATTERN = /@|\d{7,}/;

function dateOrderIssues(incident: BreachIncident): string[] {
  const issues: string[] = [];
  const { known_on: knownOn, occurred_on: occurredOn, reports } = incident;
  if (occurredOn && occurredOn > knownOn)
    issues.push(`${incident.id}: occurred_on is after known_on`);
  const afterKnown: Array<[string, string | undefined]> = [
    ["reports.preliminary_submitted_on", reports.preliminary_submitted_on],
    ["reports.final_submitted_on", reports.final_submitted_on],
    ["individuals_notified_on", incident.individuals_notified_on],
    ["entrustor_notified_on", incident.entrustor_notified_on],
  ];
  for (const [field, value] of afterKnown) {
    if (value && value < knownOn) issues.push(`${incident.id}: ${field} is before known_on`);
  }
  const { preliminary_submitted_on: preliminary, final_submitted_on: final } = reports;
  if (preliminary && final && final < preliminary) {
    issues.push(`${incident.id}: final_submitted_on is before preliminary_submitted_on`);
  }
  return issues;
}

function entrustmentIssues(incident: BreachIncident): string[] {
  if (incident.is_entrustee && !incident.entrustor_ref) {
    return [`${incident.id}: is_entrustee requires entrustor_ref (stakeholder_id)`];
  }
  if (!incident.is_entrustee && incident.entrustor_notified_on) {
    return [`${incident.id}: entrustor_notified_on set but is_entrustee is false`];
  }
  return [];
}

function countIssues(incident: BreachIncident): string[] {
  const { affected_count: count, affected_count_upper_bound: upper } = incident;
  if (count !== "unknown" && upper !== undefined && upper < count) {
    return [`${incident.id}: affected_count_upper_bound is below affected_count`];
  }
  return [];
}

function statusIssues(incident: BreachIncident): string[] {
  if (incident.status === "reported_final" && !incident.reports.final_submitted_on) {
    return [`${incident.id}: status reported_final requires reports.final_submitted_on`];
  }
  if (incident.status === "reported_preliminary" && !incident.reports.preliminary_submitted_on) {
    return [
      `${incident.id}: status reported_preliminary requires reports.preliminary_submitted_on`,
    ];
  }
  return [];
}

function dataItemIssues(incident: BreachIncident): string[] {
  return incident.data_items
    .filter((item) => PERSONAL_VALUE_PATTERN.test(item))
    .map(
      (item) =>
        `${incident.id}: data_items must be categories only (found value-like "${item.slice(0, 3)}…")`
    );
}

/** incidents.yaml の整合性（スキーマ通過後の業務ルール · 純関数） */
export function validateIncidents(incidents: readonly BreachIncident[]): string[] {
  const seen = new Set<string>();
  const issues: string[] = [];
  for (const incident of incidents) {
    if (seen.has(incident.id)) issues.push(`duplicate incident id: ${incident.id}`);
    seen.add(incident.id);
    issues.push(
      ...dateOrderIssues(incident),
      ...entrustmentIssues(incident),
      ...countIssues(incident),
      ...statusIssues(incident),
      ...dataItemIssues(incident)
    );
  }
  return issues;
}
