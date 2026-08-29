import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { MailConfig } from "../../../schemas/correspondence/mail-config.js";
import { parseMailConfigFile } from "./mail-config-parse.js";
import { ensureMailConfigExample } from "./mail-config.js";
import { getExecutiveRecordsDir, getMailConfigPath } from "./paths.js";
import { getDataDir, writeYamlFile } from "../utils.js";

export interface EnsureExecutiveMailConfigResult {
  created: boolean;
  path: string;
}

function loadRepresentativeEmail(): string | undefined {
  const path = join(getDataDir(), "company.yaml");
  if (!existsSync(path)) return undefined;
  try {
    const doc = YAML.parse(readFileSync(path, "utf-8")) as {
      public_disclosure?: { representative_email?: string; contact_email?: string };
    };
    return doc.public_disclosure?.representative_email ?? doc.public_disclosure?.contact_email;
  } catch {
    return undefined;
  }
}

/** Public disclosure email for mail-config from / rehearsal overlay. */
export function loadCompanyPublicDisclosureEmail(): string | undefined {
  return loadRepresentativeEmail();
}

export function buildDefaultExecutiveMailConfig(opts?: {
  fromEmail?: string;
  fromName?: string;
  dryRunSmtp?: boolean;
}): MailConfig {
  const email = opts?.fromEmail ?? loadRepresentativeEmail() ?? "secretary@example.com";
  const host = opts?.dryRunSmtp === false ? "smtp.example.com" : "smtp.test.local";
  return parseMailConfigFile(
    YAML.stringify({
      provider: "smtp",
      from: {
        name: opts?.fromName ?? "OrgOS Secretary",
        email,
      },
      smtp: { host, port: 587, secure: false },
      receive: { sync: "stub" },
    })
  );
}

/** Create records/executive/mail-config.yaml when missing (scheduling / correspondence ops). */
export function ensureExecutiveMailConfig(opts?: {
  dryRunSmtp?: boolean;
  force?: boolean;
}): EnsureExecutiveMailConfigResult {
  const path = getMailConfigPath();
  if (existsSync(path) && !opts?.force) {
    return { created: false, path };
  }
  mkdirSync(getExecutiveRecordsDir(), { recursive: true });
  ensureMailConfigExample();
  const config = buildDefaultExecutiveMailConfig({ dryRunSmtp: opts?.dryRunSmtp !== false });
  writeYamlFile(path, config);
  return { created: true, path };
}
