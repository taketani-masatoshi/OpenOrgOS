/**
 * Phase 5c filing guard (ADR 0052).
 * Scores only a gitignored official receipt. Does not call a government endpoint.
 *
 * Operator-supplied XSD: download the official schema from https://www.e-tax.nta.go.jp
 * (or the matching eLTAX host) and pass its local path as `xsdPath`. Do not vendor
 * copyrighted full XSD into the repo when the license forbids redistribution.
 * Paths under `tests/fixtures` are refused.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { getInstallRoot } from "../../orgos-paths.js";

export const OFFICIAL_FILING_RECEIPT_RELATIVE =
  "records/finance/official-filing-receipt.yaml";

/** Full points per item. Anything short of a real-shaped official receipt number is 0. */
export const OFFICIAL_FILING_POINTS = {
  corporate_etax: 2,
  corporate_eltax: 2,
  sole_etax: 4,
  sole_eltax: 4,
} as const;

export type OfficialFilingItem = keyof typeof OFFICIAL_FILING_POINTS;

export type OfficialFilingScores = Record<OfficialFilingItem, number>;

export type FilingCallerKind = "human" | "llm" | "mcp" | "agent";

export type OfficialFilingAttempt = {
  sent: false;
  success: false;
  reason:
    | "caller_forbidden"
    | "caller_not_authenticated"
    | "certificate_required"
    | "endpoint_not_official"
    | "xsd_invalid"
    | "official_receipt_number_required";
};

/** Decoy / invented labels never score, even if present on a gitignored path. */
const RECEIPT_DECOY =
  /fixture|not-an-official|example|dummy|sample|placeholder|fake|偽造|見本|テスト/i;

/**
 * NTA / LTA style receipt numbers are digit strings (typically 10–20).
 * A tracked fixture string or free-text invention does not match.
 */
export function looksLikeOfficialReceiptNumber(value: string): boolean {
  const s = value.trim();
  if (s.length < 10 || s.length > 20) return false;
  if (RECEIPT_DECOY.test(s)) return false;
  return /^\d+$/.test(s);
}

const ZERO_SCORES: OfficialFilingScores = {
  corporate_etax: 0,
  corporate_eltax: 0,
  sole_etax: 0,
  sole_eltax: 0,
};

function zeroScores(): OfficialFilingScores {
  return { ...ZERO_SCORES };
}

function isGitignored(root: string, relativePath: string): boolean {
  const result = spawnSync("git", ["check-ignore", "-q", "--", relativePath], {
    cwd: root,
    encoding: "utf-8",
  });
  return result.status === 0;
}

function receiptNumber(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function readGitignoredReceiptNumbers(root: string): Record<OfficialFilingItem, string> {
  const empty: Record<OfficialFilingItem, string> = {
    corporate_etax: "",
    corporate_eltax: "",
    sole_etax: "",
    sole_eltax: "",
  };
  if (!isGitignored(root, OFFICIAL_FILING_RECEIPT_RELATIVE)) return empty;
  const path = join(root, OFFICIAL_FILING_RECEIPT_RELATIVE);
  if (!existsSync(path)) return empty;
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(path, "utf-8"));
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object") return empty;
  const numbers = (parsed as { official_receipt_numbers?: unknown }).official_receipt_numbers;
  if (!numbers || typeof numbers !== "object") return empty;
  const record = numbers as Partial<Record<OfficialFilingItem, unknown>>;
  return {
    corporate_etax: receiptNumber(record.corporate_etax),
    corporate_eltax: receiptNumber(record.corporate_eltax),
    sole_etax: receiptNumber(record.sole_etax),
    sole_eltax: receiptNumber(record.sole_eltax),
  };
}

/** True only when the gitignored receipt file exists and holds a real-shaped number. */
export function hasOfficialFilingReceiptNumber(
  item: OfficialFilingItem,
  root = getInstallRoot(),
): boolean {
  const numbers = readGitignoredReceiptNumbers(root);
  return looksLikeOfficialReceiptNumber(numbers[item]);
}

/** All or nothing per item. A tracked fixture is never read. Decoy strings score 0. */
export function scoreOfficialFilingReceipt(root = getInstallRoot()): OfficialFilingScores {
  const numbers = readGitignoredReceiptNumbers(root);
  const scores = zeroScores();
  for (const item of Object.keys(OFFICIAL_FILING_POINTS) as OfficialFilingItem[]) {
    scores[item] = looksLikeOfficialReceiptNumber(numbers[item])
      ? OFFICIAL_FILING_POINTS[item]
      : 0;
  }
  return scores;
}

/**
 * Product status for the filing gate (not a government call).
 * Scores stay 0 until a human records a real receipt on the gitignored path.
 * Automated tests use disposable gitignored trees only — never this workspace tip.
 */
export function officialFilingProductStatus(root = getInstallRoot()): {
  scores: OfficialFilingScores;
  points_max: typeof OFFICIAL_FILING_POINTS;
  receipt_path: string;
  receipt_file_present: boolean;
  socket_opens: false;
  statutory_filing_met: boolean;
  note: string;
} {
  const scores = scoreOfficialFilingReceipt(root);
  const earned = (Object.keys(OFFICIAL_FILING_POINTS) as OfficialFilingItem[]).reduce(
    (sum, item) => sum + scores[item],
    0,
  );
  const max = (Object.keys(OFFICIAL_FILING_POINTS) as OfficialFilingItem[]).reduce(
    (sum, item) => sum + OFFICIAL_FILING_POINTS[item],
    0,
  );
  const path = join(root, OFFICIAL_FILING_RECEIPT_RELATIVE);
  return {
    scores,
    points_max: OFFICIAL_FILING_POINTS,
    receipt_path: OFFICIAL_FILING_RECEIPT_RELATIVE,
    receipt_file_present: existsSync(path) && isGitignored(root, OFFICIAL_FILING_RECEIPT_RELATIVE),
    socket_opens: false,
    statutory_filing_met: earned === max && max > 0,
    note:
      "Unit tests prove refuse/score in disposable trees. Statutory 充足 needs a real NTA/LTA receipt on the gitignored path. Do not file dummy returns to score.",
  };
}

export function formatOfficialFilingProductStatusMarkdown(
  status = officialFilingProductStatus(),
): string {
  const lines = [
    "# e-Tax / eLTAX filing gate (product)",
    "",
    `- socket_opens: ${status.socket_opens}`,
    `- receipt_path: \`${status.receipt_path}\``,
    `- receipt_file_present: ${status.receipt_file_present}`,
    `- statutory_filing_met: ${status.statutory_filing_met}`,
    "",
    "| item | earned | max |",
    "| --- | ---: | ---: |",
  ];
  for (const item of Object.keys(OFFICIAL_FILING_POINTS) as OfficialFilingItem[]) {
    lines.push(`| ${item} | ${status.scores[item]} | ${status.points_max[item]} |`);
  }
  lines.push("", status.note, "");
  return lines.join("\n");
}

/** An empty or decoy official receipt number is not success. */
export function filingCountsAsSuccess(officialReceiptNumber: string | undefined | null): boolean {
  return (
    typeof officialReceiptNumber === "string" &&
    looksLikeOfficialReceiptNumber(officialReceiptNumber)
  );
}

export type OfficialFilingHostKind = "etax" | "eltax";

/**
 * Map official HTTPS hosts to the e-Tax / eLTAX family.
 * Both families share attemptOfficialFiling / submitOfficialReturnXml.
 */
export function officialFilingHostKind(endpoint: string): OfficialFilingHostKind | null {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return null;
    if (url.hostname === "www.e-tax.nta.go.jp") return "etax";
    if (url.hostname === "www.eltax.lta.go.jp") return "eltax";
    return null;
  } catch {
    return null;
  }
}

export function isOfficialFilingEndpoint(endpoint: string): boolean {
  return officialFilingHostKind(endpoint) !== null;
}

/**
 * Corporate eLTAX statutory met — gitignored digit `corporate_eltax` only.
 * This module never invents or writes that receipt file.
 */
export function isCorporateEltaxFilingMet(root = getInstallRoot()): boolean {
  return hasOfficialFilingReceiptNumber("corporate_eltax", root);
}

export function isCorporateEtaxFilingMet(root = getInstallRoot()): boolean {
  return hasOfficialFilingReceiptNumber("corporate_etax", root);
}

export function isSoleEtaxFilingMet(root = getInstallRoot()): boolean {
  return hasOfficialFilingReceiptNumber("sole_etax", root);
}

export function isSoleEltaxFilingMet(root = getInstallRoot()): boolean {
  return hasOfficialFilingReceiptNumber("sole_eltax", root);
}

const ITEM_HOST_KIND: Record<OfficialFilingItem, OfficialFilingHostKind> = {
  corporate_etax: "etax",
  sole_etax: "etax",
  corporate_eltax: "eltax",
  sole_eltax: "eltax",
};

export type OfficialFilingRecordResult =
  | { recorded: true; item: OfficialFilingItem }
  | {
      recorded: false;
      reason:
        | "caller_forbidden"
        | "caller_not_authenticated"
        | "receipt_number_invalid"
        | "host_mismatch"
        | "path_not_gitignored"
        | "write_failed";
    };

/**
 * Human-only save of a receipt number already obtained on the official site.
 * Does not invent numbers, open sockets, or treat government API success.
 * Writes only the gitignored path; other items already on disk are kept.
 */
export function recordOfficialFilingReceipt(
  input: {
    caller: { kind: FilingCallerKind; authenticated?: boolean };
    item: OfficialFilingItem;
    officialReceiptNumber: string;
    endpoint: string;
  },
  root = getInstallRoot(),
  log: (line: string) => void = () => {},
): OfficialFilingRecordResult {
  const refuse = (reason: Extract<OfficialFilingRecordResult, { recorded: false }>["reason"]) => {
    log(`official-filing-record ${reason} item=${input.item}`);
    return { recorded: false as const, reason };
  };

  if (input.caller.kind === "llm" || input.caller.kind === "mcp" || input.caller.kind === "agent") {
    return refuse("caller_forbidden");
  }
  if (input.caller.authenticated !== true) return refuse("caller_not_authenticated");

  const digits = input.officialReceiptNumber.trim();
  if (!looksLikeOfficialReceiptNumber(digits)) return refuse("receipt_number_invalid");

  const hostKind = officialFilingHostKind(input.endpoint);
  if (!hostKind || hostKind !== ITEM_HOST_KIND[input.item]) return refuse("host_mismatch");

  if (!isGitignored(root, OFFICIAL_FILING_RECEIPT_RELATIVE)) {
    return refuse("path_not_gitignored");
  }

  const path = join(root, OFFICIAL_FILING_RECEIPT_RELATIVE);
  const existing = readGitignoredReceiptNumbers(root);
  const next = { ...existing, [input.item]: digits };
  const body = {
    official_receipt_numbers: {
      corporate_etax: next.corporate_etax || undefined,
      corporate_eltax: next.corporate_eltax || undefined,
      sole_etax: next.sole_etax || undefined,
      sole_eltax: next.sole_eltax || undefined,
    },
  };
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${YAML.stringify(body).trimEnd()}\n`, "utf8");
  } catch {
    return refuse("write_failed");
  }
  // Do not log the full receipt number.
  log(`official-filing-record recorded item=${input.item} digits_len=${digits.length}`);
  return { recorded: true, item: input.item };
}

/**
 * Operator-supplied local XSD only. Fixture trees and missing files fail closed.
 * Does not download schema; the human places the official file and passes its path.
 */
export function isAllowedOfficialXsdPath(xsdPath: string | undefined): boolean {
  if (!xsdPath || !xsdPath.trim()) return false;
  const normalized = xsdPath.replace(/\\/g, "/").toLowerCase();
  // Fixture trees never count as operator-supplied official XSD (case-insensitive).
  if (normalized.includes("tests/fixtures") || normalized.includes("/fixtures/")) return false;
  if (normalized.includes("not-an-official")) return false;
  return existsSync(xsdPath);
}

/**
 * Optional local XSD for operator machines. CI must not set this.
 * Returns undefined when unset or when the path fails isAllowedOfficialXsdPath.
 * Official XSD files must never be committed to the repo.
 * Operator: download from e-Tax / eLTAX, set ORGOS_OFFICIAL_XSD_PATH, then xmllint.
 * Toy schemas written only for tests do not satisfy the ops path.
 */
export function resolveOptionalLocalOfficialXsdPath(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const raw = env.ORGOS_OFFICIAL_XSD_PATH?.trim();
  if (!raw) return undefined;
  return isAllowedOfficialXsdPath(raw) ? raw : undefined;
}

export type OfficialXsdConnectionStatus =
  | { status: "ok"; path: string }
  | { status: "xsd_path_unset" }
  | { status: "xsd_path_invalid"; path: string };

/** Live connection status for Chat / filing-score honesty (no download). */
export function officialXsdConnectionStatus(
  env: NodeJS.ProcessEnv = process.env,
): OfficialXsdConnectionStatus {
  const raw = env.ORGOS_OFFICIAL_XSD_PATH?.trim();
  if (!raw) return { status: "xsd_path_unset" };
  if (!isAllowedOfficialXsdPath(raw)) return { status: "xsd_path_invalid", path: raw };
  return { status: "ok", path: raw };
}


function emitFilingLog(
  log: (line: string) => void,
  reason: string,
  privateKeyPem: string | undefined,
): void {
  const secret = privateKeyPem?.trim();
  let line = `official-filing ${reason}`;
  if (secret) line = line.split(secret).join("[redacted]");
  log(line);
}

/**
 * Shared send gate for e-Tax (www.e-tax.nta.go.jp) and eLTAX (www.eltax.lta.go.jp).
 * Refuse LLM, MCP, and agent callers. An authenticated human with a certificate
 * may target an official endpoint only. This function does not open a connection.
 * Success stays false until an official receipt number exists on the gitignored path.
 * xsd_invalid (via submitOfficialReturnXml) is refusal, never 充足.
 */
function callerGateReason(
  input: {
    caller: { kind: FilingCallerKind; authenticated?: boolean };
    certificatePresent?: boolean;
    endpoint?: string;
  },
): OfficialFilingAttempt["reason"] | null {
  if (input.caller.kind === "llm" || input.caller.kind === "mcp" || input.caller.kind === "agent") {
    return "caller_forbidden";
  }
  if (input.caller.authenticated !== true) return "caller_not_authenticated";
  if (input.certificatePresent !== true) return "certificate_required";
  if (!input.endpoint || !isOfficialFilingEndpoint(input.endpoint)) {
    return "endpoint_not_official";
  }
  return null;
}

export function attemptOfficialFiling(
  input: {
    caller: { kind: FilingCallerKind; authenticated?: boolean };
    certificatePresent?: boolean;
    privateKeyPem?: string;
    endpoint?: string;
  },
  log: (line: string) => void = () => {},
): OfficialFilingAttempt {
  const privateKeyPem = input.privateKeyPem;
  const refuse = (reason: OfficialFilingAttempt["reason"]): OfficialFilingAttempt => {
    emitFilingLog(log, reason, privateKeyPem);
    return { sent: false, success: false, reason };
  };

  const early = callerGateReason(input);
  if (early) return refuse(early);

  // No government call. A number the caller typed is not an official receipt.
  // Scoring reads only the gitignored file written after a real NTA/LTA submission.
  return refuse("official_receipt_number_required");
}

/**
 * Human-only handoff of a return XML document to an official host
 * (e-Tax or eLTAX). Does not open a socket. The XML body is not logged.
 * Success stays false until a gitignored official receipt number exists.
 * xsd_invalid is closed refusal — never 充足.
 */
export function officialReturnXmlMatchesXsd(xml: string, xsdPath: string | undefined): boolean {
  if (!isAllowedOfficialXsdPath(xsdPath) || xml.trim().length === 0) return false;
  const result = spawnSync("xmllint", ["--noout", "--schema", xsdPath!, "-"], {
    input: xml,
    encoding: "utf8",
  });
  return result.status === 0;
}

export function submitOfficialReturnXml(
  input: {
    caller: { kind: FilingCallerKind; authenticated?: boolean };
    certificatePresent?: boolean;
    privateKeyPem?: string;
    endpoint: string;
    xml: string;
    /** Local path to operator-downloaded official XSD (not under tests/fixtures). */
    xsdPath?: string;
  },
  log: (line: string) => void = () => {},
): OfficialFilingAttempt {
  const bytes = Buffer.byteLength(input.xml, "utf8");
  const guarded: (line: string) => void = (line) => {
    log(`${line} xml_bytes=${bytes}`);
  };
  const refuse = (reason: OfficialFilingAttempt["reason"]): OfficialFilingAttempt => {
    emitFilingLog(guarded, reason, input.privateKeyPem);
    return { sent: false, success: false, reason };
  };

  // Path: human + auth + certificate + official host → operator XSD → no socket.
  // Fixture XSD / xmllint failure → xsd_invalid (never 充足).
  const early = callerGateReason(input);
  if (early) return refuse(early);
  if (input.xml.trim().length === 0 || !officialReturnXmlMatchesXsd(input.xml, input.xsdPath)) {
    return refuse("xsd_invalid");
  }
  // Still no live call. Success stays false until the gitignored receipt exists.
  return refuse("official_receipt_number_required");
}
