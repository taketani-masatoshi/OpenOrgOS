import { existsSync, readFileSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import type { MailConfig } from "../../../schemas/correspondence/mail-config.js";
import { parseMailConfigFile } from "../correspondence/mail-config-parse.js";
import { loadMailConfig } from "../correspondence/mail-config.js";
import { getMailConfigPath } from "../correspondence/paths.js";
import { loadCompanyPublicDisclosureEmail } from "../correspondence/ensure-mail-config.js";

function buildRehearsalMailConfig(fromEmail: string): MailConfig {
  return parseMailConfigFile(
    YAML.stringify({
      provider: "smtp",
      from: { name: "OrgOS Rehearsal", email: fromEmail },
      smtp: { host: "smtp.test.local", port: 587, secure: false },
      receive: { sync: "stub" },
    })
  );
}

/** Temporarily overlay smtp.test.local mail-config for CLI rehearsal (restores on dispose). */
export function withRehearsalMailOverlay<T>(fn: () => T): T {
  const path = getMailConfigPath();
  const hadFile = existsSync(path);
  const backup = hadFile ? readFileSync(path, "utf-8") : undefined;
  const fromEmail = loadCompanyPublicDisclosureEmail() ?? loadMailConfig()?.from.email ?? "rehearsal@orgos.local";
  writeFileSync(path, YAML.stringify(buildRehearsalMailConfig(fromEmail)), "utf-8");
  try {
    return fn();
  } finally {
    if (backup !== undefined) {
      writeFileSync(path, backup, "utf-8");
    }
  }
}

export async function withRehearsalMailOverlayAsync<T>(fn: () => Promise<T>): Promise<T> {
  const path = getMailConfigPath();
  const hadFile = existsSync(path);
  const backup = hadFile ? readFileSync(path, "utf-8") : undefined;
  const fromEmail = loadCompanyPublicDisclosureEmail() ?? loadMailConfig()?.from.email ?? "rehearsal@orgos.local";
  writeFileSync(path, YAML.stringify(buildRehearsalMailConfig(fromEmail)), "utf-8");
  try {
    return await fn();
  } finally {
    if (backup !== undefined) {
      writeFileSync(path, backup, "utf-8");
    }
  }
}
