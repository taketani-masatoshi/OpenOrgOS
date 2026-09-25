import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeCustomerPilot } from "../lib/customer-pilot-metrics.mjs";

const row = (changes = {}) => ({
  case_id: "case-1",
  data_kind: "production",
  cohort: "pilot",
  observed_at: "2026-09-22T00:00:00.000Z",
  completed: true,
  transactions: 100,
  work_minutes: 30,
  assistance_minutes: 0,
  approval_wait_minutes: null,
  corrections: 0,
  incidents: null,
  ...changes,
});
const report = (observations) => summarizeCustomerPilot({ version: 1, observations });

test("empty and missing observations stay unknown, while observed zero stays zero", () => {
  assert.equal(report([]).groups[0].pilot.completion_rate, null);
  const result = report([row()]).groups[0].pilot;
  assert.equal(result.assistance_minutes_per_attempt.value, 0);
  assert.equal(result.incidents_per_attempt.value, null);
  assert.equal(result.approval_wait_minutes_per_attempt.missing_cases, 1);
});

test("synthetic results cannot populate production metrics", () => {
  const result = report([row({ data_kind: "synthetic" })]);
  assert.equal(result.groups[0].pilot.attempts, 0);
  assert.equal(result.groups[1].pilot.attempts, 1);
});

test("weights work by volume and counts failed attempts in completion and support metrics", () => {
  const result = report([
    row({ cohort: "baseline", work_minutes: 60 }),
    row(),
    row({ case_id: "case-2", transactions: 300, work_minutes: 30 }),
    row({ case_id: "failed", completed: false, work_minutes: 99, assistance_minutes: 12 }),
  ]).groups[0];
  assert.equal(result.pilot.completion_rate, 2 / 3);
  assert.equal(result.pilot.work_minutes_per_100_transactions.value, 15);
  assert.equal(result.pilot.assistance_minutes_per_attempt.value, 4);
  assert.equal(result.work_time_reduction_rate, 0.75);
});

test("rejects duplicate attempts and invalid measurement values", () => {
  assert.throws(() => report([row(), row()]), /Duplicate/);
  for (const value of [-1, NaN, Infinity])
    assert.throws(() => report([row({ work_minutes: value })]));
  assert.throws(() => report([row({ transactions: 0 })]));
});

test("zero or absent baseline does not fabricate an improvement rate", () => {
  assert.equal(report([row()]).groups[0].work_time_reduction_rate, null);
  assert.equal(
    report([row({ cohort: "baseline", work_minutes: 0 }), row()]).groups[0]
      .work_time_reduction_rate,
    null
  );
});
