import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { externalAccountL1Schema, externalAccountSecretSchema, type ExternalAccountL1, type ExternalAccountSecret } from "../../../schemas/finance/external-accounts.js";
import { getDataDir } from "../utils.js";

const l1File = (baseDir: string) => join(baseDir, "external-finance", "accounts.l1.json");
const secretFile = (baseDir: string) => join(baseDir, "external-finance", "accounts.private.json");
const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

export function loadExternalAccountConfig(baseDir = getDataDir()): { accounts: ExternalAccountL1[]; secrets: ExternalAccountSecret[] } {
  const l1 = z.object({ accounts: z.array(externalAccountL1Schema) }).parse(read(l1File(baseDir)));
  const secrets = z.object({ accounts: z.array(externalAccountSecretSchema) }).parse(read(secretFile(baseDir)));
  return { accounts: l1.accounts, secrets: secrets.accounts };
}

export function findExternalAccount(provider: ExternalAccountSecret["provider"], accountId: string, baseDir = getDataDir()) {
  const config = loadExternalAccountConfig(baseDir);
  const l1 = config.accounts.find((account) => account.provider === provider && account.account_id === accountId && account.enabled);
  const secret = config.secrets.find((account) => account.provider === provider && account.account_id === accountId);
  if (!l1 || !secret) throw new Error(`External finance account is not configured: ${provider}/${accountId}`);
  return { ...l1, ...secret };
}
