import { daysBetween, currentDate } from "../../../../src/lib/utils.js";
import { listCleaningReportsDue } from "./cleaning.js";
import { listDamageClaimsDue } from "./damage.js";
import { listIdDocsDuePurge } from "./access-and-docs.js";
import { listRecurringDue } from "./recurring.js";
import { computeNightsCap } from "./nights-cap.js";
import { validateGuestRegister } from "./guest-register.js";
import {
  hospitalityModuleEnabled,
  loadStays,
  loadTaxLedger,
  type HospitalityOpsDueItem,
} from "./ops-lib.js";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function listHospitalityOpsDue(today = currentDate()): HospitalityOpsDueItem[] {
  if (!hospitalityModuleEnabled()) return [];
  const items: HospitalityOpsDueItem[] = [];
  try {
    const ledger = loadTaxLedger();
    const lead = ledger.filing.lead_days.length ? ledger.filing.lead_days : [14, 7];
    const maxLead = Math.max(...lead);
    for (const filing of ledger.period_filings) {
      if (["filed", "paid", "closed"].includes(filing.status)) continue;
      const due = filing.due_on;
      const filingMonthStart = `${due.slice(0, 7)}-01`;
      if (today < filingMonthStart && today < addDays(due, -maxLead)) continue;
      const daysUntil = daysBetween(today, due);
      const overdue = today > due;
      items.push({
        id: `tax-${filing.period}`,
        severity: overdue || daysUntil <= 7 ? "p0" : daysUntil <= 14 ? "p1" : "p2",
        kind: "tax",
        title: overdue
          ? `宿泊税 ${filing.period} 申告期限超過（${due}）`
          : `宿泊税 ${filing.period} 申告（期限 ${due}）`,
        due_on: due,
        cli_hint: `operations hospitality tax-status --period ${filing.period}`,
      });
    }
  } catch {
    /* tenant without tax ledger */
  }
  try {
    for (const stay of loadStays().stays) {
      if (stay.status === "booked" && stay.check_in <= today && stay.check_in >= addDays(today, -1)) {
        items.push({
          id: `ci-${stay.id}`,
          severity: stay.check_in < today ? "p0" : "p1",
          kind: "stay",
          title: `チェックイン ${stay.id}（${stay.check_in}）`,
          due_on: stay.check_in,
          cli_hint: `operations hospitality check-in --id ${stay.id}`,
        });
      }
      if (stay.status === "checked_in" && stay.check_out <= today) {
        items.push({
          id: `co-${stay.id}`,
          severity: "p0",
          kind: "stay",
          title: `チェックアウト ${stay.id}（${stay.check_out}）`,
          due_on: stay.check_out,
          cli_hint: `operations hospitality check-out --id ${stay.id}`,
        });
      }
      if (
        stay.status === "checked_out" &&
        stay.cleaning_status !== "done" &&
        stay.cleaning_status !== "na"
      ) {
        items.push({
          id: `cl-${stay.id}`,
          severity: stay.cleaning_status === "pending" ? "p1" : "p2",
          kind: "cleaning",
          title: `清掃未完了 ${stay.id}`,
          due_on: stay.check_out,
          cli_hint: "operations hospitality cleaning-order",
        });
      }
    }
  } catch {
    /* no stays file */
  }
  try {
    for (const report of listCleaningReportsDue()) {
      items.push({
        id: `clr-${report.id}`,
        severity: report.status === "issue" ? "p0" : "p1",
        kind: "cleaning",
        title:
          report.status === "issue"
            ? `清掃 issue 未解決 ${report.stay_id}`
            : `清掃レポート未検収 ${report.stay_id}`,
        due_on: report.submitted_on ?? today,
        cli_hint: `operations hospitality cleaning-accept --stay-id ${report.stay_id}`,
      });
    }
  } catch {
    /* no cleaning reports */
  }
  try {
    for (const incident of listDamageClaimsDue()) {
      items.push({
        id: `dmg-${incident.id}`,
        severity: incident.claim_status === "preparing" ? "p1" : "p2",
        kind: "damage",
        title: `破損 claim ${incident.claim_status} ${incident.id}`,
        due_on: incident.discovered_on,
        cli_hint: `operations hospitality damage-claim --id ${incident.id}`,
      });
    }
  } catch {
    /* no damage file */
  }
  try {
    for (const task of listRecurringDue(today)) {
      items.push({
        id: `rec-${task.id}`,
        severity: task.next_due < today ? "p0" : "p1",
        kind: "recurring",
        title: `${task.title}（期限 ${task.next_due}）`,
        due_on: task.next_due,
        cli_hint: task.cli_hint ?? "operations hospitality recurring-list",
      });
    }
  } catch {
    /* no recurring file */
  }
  try {
    for (const doc of listIdDocsDuePurge(today)) {
      items.push({
        id: `iddoc-${doc.id}`,
        severity: "p1",
        kind: "id_doc",
        title: `ID 文書保持期限超過 ${doc.id}`,
        due_on: doc.retained_until,
        cli_hint: `operations hospitality id-docs-purge --id ${doc.id}`,
      });
    }
  } catch {
    /* no id doc index */
  }
  try {
    const cap = computeNightsCap(today.slice(0, 4));
    if (cap.cap_applies) {
      if (cap.severity === "over") {
        items.push({
          id: `nights-${cap.year}`,
          severity: "p0",
          kind: "nights_cap",
          title: `民泊 ${cap.year} 年 ${cap.occupied_nights} 泊（上限 ${cap.cap} 超過）`,
          due_on: today,
          cli_hint: "operations hospitality nights-cap",
        });
      } else if (cap.severity === "warn") {
        items.push({
          id: `nights-${cap.year}`,
          severity: "p1",
          kind: "nights_cap",
          title: `民泊 ${cap.year} 年 ${cap.occupied_nights} 泊（残 ${cap.remaining} 日）`,
          due_on: `${cap.year}-12-31`,
          cli_hint: "operations hospitality nights-cap",
        });
      }
    }
  } catch {
    /* nights cap optional */
  }
  try {
    const year = today.slice(0, 4);
    const month = today.slice(5, 7);
    const register = validateGuestRegister({ year, month });
    const hasErrors = register.issues.some((i) => i.level === "error");
    const missingFile = register.issues.some((i) => i.code === "missing_file");
    if (hasErrors) {
      items.push({
        id: `register-${year}-${month}`,
        severity: "p0",
        kind: "register",
        title: `宿泊者名簿 ${year}-${month} に error あり（${register.issues.filter((i) => i.level === "error").length} 件）`,
        due_on: today,
        cli_hint: "operations hospitality register-validate",
      });
    } else if (missingFile || register.rowCount === 0) {
      items.push({
        id: `register-${year}-${month}`,
        severity: "p1",
        kind: "register",
        title: `宿泊者名簿 ${year}-${month} 未作成または空`,
        due_on: today,
        cli_hint: "operations hospitality register-validate",
      });
    }
  } catch {
    /* register optional */
  }
  const rank = { p0: 0, p1: 1, p2: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity] || a.due_on.localeCompare(b.due_on));
}
