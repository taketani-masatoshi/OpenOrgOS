import { loadContracts } from "../lib/data.js";
import {
  buildContractStatusView,
  formatContractStatusMarkdown,
} from "../lib/contract-status-view.js";
import type { ContractType } from "../../schemas/index.js";

import { requireCliReportWrite } from "../lib/console-auth/cli-operator.js";
import {
  buildContractsDigestMarkdown,
  writeContractsDigest,
} from "../lib/contracts/contracts-digest.js";
import { currentDate } from "../lib/utils.js";

export function runContractsList(options: {
  type?: string;
  property?: string;
}): void {
  let contracts = loadContracts();

  if (options.type) {
    contracts = contracts.filter((c) => c.type === options.type);
  }
  if (options.property) {
    contracts = contracts.filter((c) => c.property_id === options.property);
  }

  if (contracts.length === 0) {
    console.log("契約が見つかりません。");
    return;
  }

  console.log(
    "ID".padEnd(10) +
      "Name".padEnd(30) +
      "Type".padEnd(12) +
      "Status".padEnd(10) +
      "Counterparty".padEnd(18) +
      "End".padEnd(12) +
      "Risk"
  );
  console.log("-".repeat(100));

  for (const c of contracts) {
    console.log(
      c.id.padEnd(10) +
        c.name.slice(0, 28).padEnd(30) +
        c.type.padEnd(12) +
        (c.status ?? "draft").padEnd(10) +
        c.counterparty.slice(0, 16).padEnd(18) +
        (c.end_date ?? "-").padEnd(12) +
        (c.risk?.risk_level ?? "-")
    );
  }
}

export function runContractsShow(id: string): void {
  const contract = loadContracts().find((c) => c.id === id);

  if (!contract) {
    console.error(`契約 ${id} が見つかりません。`);
    process.exit(1);
  }

  console.log(JSON.stringify(contract, null, 2));
}

export function runContractsSummary(options?: { days?: number; json?: boolean }): void {
  const view = buildContractStatusView({
    horizonDays: options?.days ?? 90,
  });
  if (options?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(formatContractStatusMarkdown(view));
}

export const CONTRACT_TYPES: ContractType[] = [
  "rental",
  "management",
  "cleaning",
  "ota",
  "insurance",
  "construction",
  "outsourcing",
  "advisory",
  "system",
  "nda",
  "partnership",
];
export function runContractsDigest(opts?: {
  write?: boolean;
  days?: number;
  json?: boolean;
}): void {
  if (opts?.write) {
    requireCliReportWrite("contracts digest");
    const result = writeContractsDigest({ days: opts.days });
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, ...result }, null, 2));
      return;
    }
    console.log(`✓ Contracts digest: ${result.path}`);
    console.log(result.markdown);
    return;
  }
  const markdown = buildContractsDigestMarkdown({ days: opts?.days });
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, as_of: currentDate(), markdown }, null, 2));
    return;
  }
  console.log(markdown);
}
