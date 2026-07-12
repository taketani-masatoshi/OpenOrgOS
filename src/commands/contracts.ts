import { loadContracts } from "../lib/data.js";
import type { ContractType } from "../../schemas/index.js";

export function runContractsList(options: { type?: string; property?: string }): void {
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
