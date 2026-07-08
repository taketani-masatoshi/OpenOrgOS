import type { Contract } from "../../schemas/index.js";
import { daysBetween, currentDate } from "./utils.js";

export type AlertType = "end_date" | "renewal_deadline" | "termination_deadline";

export interface ContractAlert {
  contractId: string;
  contractName: string;
  counterparty: string;
  alertType: AlertType;
  deadline: string;
  daysRemaining: number;
  riskLevel: string;
  propertyId?: string;
  notes?: string;
}

const RISK_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function getAlertTypeLabel(type: AlertType): string {
  switch (type) {
    case "end_date":
      return "契約終了";
    case "renewal_deadline":
      return "更新期限";
    case "termination_deadline":
      return "解約期限";
  }
}

export function scanContractAlerts(
  contracts: Contract[],
  daysAhead: number,
  riskLevelFilter?: string
): ContractAlert[] {
  const today = currentDate();
  const alerts: ContractAlert[] = [];

  for (const c of contracts) {
    const riskLevel = c.risk?.risk_level ?? "low";

    if (riskLevelFilter && riskLevel !== riskLevelFilter) continue;

    const deadlines: { type: AlertType; date: string }[] = [];

    if (c.end_date) {
      deadlines.push({ type: "end_date", date: c.end_date });
    }
    if (c.risk?.renewal_deadline) {
      deadlines.push({ type: "renewal_deadline", date: c.risk.renewal_deadline });
    }
    if (c.risk?.termination_deadline) {
      deadlines.push({ type: "termination_deadline", date: c.risk.termination_deadline });
    }

    for (const d of deadlines) {
      const remaining = daysBetween(today, d.date);
      if (remaining >= 0 && remaining <= daysAhead) {
        alerts.push({
          contractId: c.id,
          contractName: c.name,
          counterparty: c.counterparty,
          alertType: d.type,
          deadline: d.date,
          daysRemaining: remaining,
          riskLevel,
          propertyId: c.property_id,
          notes: c.risk?.notes,
        });
      }
    }
  }

  alerts.sort((a, b) => {
    const riskDiff = (RISK_ORDER[a.riskLevel] ?? 3) - (RISK_ORDER[b.riskLevel] ?? 3);
    if (riskDiff !== 0) return riskDiff;
    return a.daysRemaining - b.daysRemaining;
  });

  return alerts;
}

export function formatAlertsMarkdown(alerts: ContractAlert[], daysAhead: number): string {
  const lines = [
    "# 契約期限アラート",
    "",
    `基準日: ${currentDate()} / 対象: ${daysAhead}日以内`,
    "",
  ];

  if (alerts.length === 0) {
    lines.push("該当するアラートはありません。");
    return lines.join("\n");
  }

  lines.push("| 契約ID | 契約名 | 種別 | 期限 | 残日数 | リスク | 相手先 |");
  lines.push("|---|---|---|---|---:|---|---|");

  for (const a of alerts) {
    lines.push(
      `| ${a.contractId} | ${a.contractName} | ${getAlertTypeLabel(a.alertType)} | ${a.deadline} | ${a.daysRemaining} | ${a.riskLevel} | ${a.counterparty} |`
    );
  }

  lines.push("");
  for (const a of alerts) {
    if (a.notes) {
      lines.push(`- **${a.contractId}**: ${a.notes}`);
    }
  }

  return lines.join("\n");
}

export function formatAlertsTable(alerts: ContractAlert[]): void {
  if (alerts.length === 0) {
    console.log("該当するアラートはありません。");
    return;
  }

  console.log(
    "ID".padEnd(10) +
      "Name".padEnd(30) +
      "Type".padEnd(12) +
      "Deadline".padEnd(12) +
      "Days".padEnd(6) +
      "Risk".padEnd(8) +
      "Counterparty"
  );
  console.log("-".repeat(90));

  for (const a of alerts) {
    console.log(
      a.contractId.padEnd(10) +
        a.contractName.slice(0, 28).padEnd(30) +
        getAlertTypeLabel(a.alertType).padEnd(12) +
        a.deadline.padEnd(12) +
        String(a.daysRemaining).padEnd(6) +
        a.riskLevel.padEnd(8) +
        a.counterparty
    );
  }
}
