import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  bankAccountFileSchema,
  type BankAccountFile,
} from "../../../schemas/finance/bank-account.js";
import { getDataDir, readYamlFile } from "../utils.js";

export function bankAccountConfigPath(): string {
  return join(getDataDir(), "finance", "bank-account.yaml");
}

export function loadBankAccountConfig(): BankAccountFile | null {
  const path = bankAccountConfigPath();
  if (!existsSync(path)) return null;
  return readYamlFile(path, bankAccountFileSchema);
}
