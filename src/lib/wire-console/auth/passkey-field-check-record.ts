/**
 * Append automated passkey field-check results to passkey-field-validation-log.md.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "../../tenant.js";
import type { PasskeyFieldCheckResult, PasskeyFieldCheckRow } from "./passkey-field-check.js";

const LOG_PATH = join(ROOT_DIR, "docs/org-os/passkey-field-validation-log.md");

export interface PasskeyFieldRecordOptions {
  operator?: string;
  date?: string;
}

function rowById(rows: PasskeyFieldCheckRow[], id: string): PasskeyFieldCheckRow | undefined {
  return rows.find((r) => r.id === id);
}

function doctorRows(rows: PasskeyFieldCheckRow[]): PasskeyFieldCheckRow[] {
  return rows.filter((r) => r.id.startsWith("doctor_"));
}

function resultLabel(ok: boolean, warn?: boolean): string {
  if (ok) return "Pass";
  if (warn) return "Warn";
  return "Fail";
}

export function deriveFieldChecklistResults(result: PasskeyFieldCheckResult): {
  checklist: Record<1 | 2 | 3 | 4 | 5, string>;
  host: string;
} {
  const host = (() => {
    try {
      return new URL(result.url).host;
    } catch {
      return result.url;
    }
  })();

  const originOk =
    rowById(result.rows, "health")?.ok === true &&
    rowById(result.rows, "auth_config")?.ok === true &&
    rowById(result.rows, "webauthn_origin_match")?.ok === true;

  const credentialRow = rowById(result.rows, "credential_file_mode");
  const doctor = doctorRows(result.rows);
  const doctorOk = doctor.length > 0 && doctor.every((r) => r.ok || r.warn);

  return {
    host,
    checklist: {
      1: resultLabel(originOk),
      2: "要手動",
      3: "要手動",
      4: resultLabel(credentialRow?.ok ?? false, credentialRow?.warn),
      5: resultLabel(doctorOk),
    },
  };
}

function parseTableRow(line: string): string[] {
  return line.split("|").slice(1, -1).map((c) => c.trim());
}

export function recordPasskeyFieldCheckToLog(
  result: PasskeyFieldCheckResult,
  opts: PasskeyFieldRecordOptions = {},
): string {
  const date =
    opts.date ??
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const operator = opts.operator ?? "field-check";
  const { host, checklist } = deriveFieldChecklistResults(result);

  const md = readFileSync(LOG_PATH, "utf-8");
  const lines = md.split("\n");
  const headerIdx = lines.findIndex((l) => l.startsWith("| # | 項目 |"));
  if (headerIdx < 0) {
    throw new Error("passkey-field-validation-log.md: table header missing");
  }

  for (let num = 1; num <= 5; num++) {
    const idx = lines.findIndex((l, i) => i > headerIdx && l.startsWith(`| ${num} |`));
    if (idx < 0) continue;
    const cols = parseTableRow(lines[idx]!);
    const item = cols[0] ?? "";
    if (num === 2 || num === 3) {
      const existingResult = cols[3] ?? "";
      if (existingResult && existingResult !== "要手動") continue;
      lines[idx] = `| ${num} | ${item} | ${host} | ${date} | 要手動 | ${operator} |`;
      continue;
    }
    lines[idx] = `| ${num} | ${item} | ${host} | ${date} | ${checklist[num as 1 | 2 | 3 | 4 | 5]} | ${operator} |`;
  }

  writeFileSync(LOG_PATH, lines.join("\n"), "utf-8");
  return LOG_PATH;
}
