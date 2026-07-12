#!/usr/bin/env node
/**
 * Mechanical constitution score (ADR 0003 · PR-A12).
 *
 *   npm run constitution:score
 *   npm run constitution:score -- --json
 *   npm run constitution:score -- --min A
 */

import { setTenantId } from "../src/lib/tenant.js";
import {
  evaluateConstitutionCompliance,
  formatConstitutionScoreMarkdown,
  smokeCompanyEventsReduce,
  type AxisGrade,
} from "../src/lib/constitution-compliance.js";

if (!process.env.ORGOS_TENANT?.trim() && !process.env.STEWARD_TENANT?.trim()) {
  setTenantId("mal");
}

const args = process.argv.slice(2);
const json = args.includes("--json");
const minIdx = args.indexOf("--min");
const minGrade = (minIdx >= 0 ? args[minIdx + 1] : "A-") as AxisGrade;

const report = evaluateConstitutionCompliance({ minGrade });
const reduceSmoke = smokeCompanyEventsReduce();

if (json) {
  console.log(JSON.stringify({ ...report, company_events_reduce: reduceSmoke }, null, 2));
} else {
  console.log(formatConstitutionScoreMarkdown(report));
  console.log(
    `company-events reduce smoke: ${reduceSmoke.ok ? "ok" : "fail"} — ${reduceSmoke.detail}`
  );
}

if (!report.pass || !reduceSmoke.ok) {
  process.exit(1);
}
