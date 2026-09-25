import { z } from "zod";

const measure = z.number().finite().nonnegative().nullable();
const observation = z
  .object({
    case_id: z.string().min(1),
    data_kind: z.enum(["synthetic", "production"]),
    cohort: z.enum(["baseline", "pilot"]),
    observed_at: z.string().datetime(),
    completed: z.boolean(),
    transactions: z.number().int().positive(),
    work_minutes: measure,
    assistance_minutes: measure,
    approval_wait_minutes: measure,
    corrections: z.number().int().nonnegative().nullable(),
    incidents: z.number().int().nonnegative().nullable(),
  })
  .strict();

export function summarizeCustomerPilot(input) {
  const { observations } = z
    .object({ version: z.literal(1), observations: z.array(observation) })
    .strict()
    .parse(input);
  const seen = new Set();
  for (const row of observations) {
    const key = JSON.stringify([row.data_kind, row.cohort, row.case_id]);
    if (seen.has(key)) throw new Error("Duplicate case within data_kind/cohort");
    seen.add(key);
  }
  function metric(rows, field, perTransactions = false) {
    const measured = rows.filter((row) => row[field] !== null);
    const denominator = measured.reduce(
      (sum, row) => sum + (perTransactions ? row.transactions : 1),
      0
    );
    return {
      observed_cases: measured.length,
      missing_cases: rows.length - measured.length,
      value: denominator
        ? (measured.reduce((sum, row) => sum + row[field], 0) / denominator) *
          (perTransactions ? 100 : 1)
        : null,
    };
  }
  function cohort(dataKind, name) {
    const rows = observations.filter((row) => row.data_kind === dataKind && row.cohort === name);
    const complete = rows.filter((row) => row.completed);
    return {
      attempts: rows.length,
      completed: complete.length,
      completion_rate: rows.length ? complete.length / rows.length : null,
      work_minutes_per_100_transactions: metric(complete, "work_minutes", true),
      assistance_minutes_per_attempt: metric(rows, "assistance_minutes"),
      approval_wait_minutes_per_attempt: metric(rows, "approval_wait_minutes"),
      corrections_per_100_transactions: metric(rows, "corrections", true),
      incidents_per_attempt: metric(rows, "incidents"),
    };
  }
  return {
    version: 1,
    groups: ["production", "synthetic"].map((kind) => {
      const baseline = cohort(kind, "baseline");
      const pilot = cohort(kind, "pilot");
      const before = baseline.work_minutes_per_100_transactions.value;
      const after = pilot.work_minutes_per_100_transactions.value;
      return {
        data_kind: kind,
        baseline,
        pilot,
        work_time_reduction_rate:
          before !== null && before > 0 && after !== null ? (before - after) / before : null,
      };
    }),
  };
}
