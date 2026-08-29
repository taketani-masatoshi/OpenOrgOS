import { existsSync, readdirSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  GUEST_REGISTER_ALL_KNOWN_COLUMNS,
  GUEST_REGISTER_FILENAME,
  GUEST_REGISTER_FOREIGN_COLUMNS,
  GUEST_REGISTER_REQUIRED_COLUMNS,
  GUEST_REGISTER_RETENTION_YEARS,
} from "../../../../schemas/hospitality-guest-register.js";
import { parseCsv } from "../../../../src/lib/csv.js";
import { getModuleById } from "../../../../src/lib/ops-config.js";
import { hospitalityModuleEnabled, loadStays } from "./ops-lib.js";
import { getDocsDir } from "../../../../src/lib/utils.js";

export type GuestRegisterIssue = {
  level: "error" | "warning";
  file: string;
  line?: number;
  column?: string;
  code: string;
  message: string;
};

export type GuestRegisterValidationResult = {
  files: string[];
  issues: GuestRegisterIssue[];
  rowCount: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function docsRecordsRoot(): string | undefined {
  const mod = getModuleById("hospitality");
  if (!mod?.docs_root) return undefined;
  const root = mod.docs_root.replace(/^docs\//, "").replace(/\/$/, "");
  return join(getDocsDir(), root, "records");
}

function resolveRegisterPath(year: string, month: string): string | undefined {
  const base = docsRecordsRoot();
  if (!base) return undefined;
  return join(base, year, month, GUEST_REGISTER_FILENAME);
}

function relativeRegisterPath(year: string, month: string): string {
  const mod = getModuleById("hospitality");
  const docsRoot = (mod?.docs_root ?? "docs/properties/PROP-002/operations/").replace(/\/$/, "");
  return `${docsRoot}/records/${year}/${month}/${GUEST_REGISTER_FILENAME}`;
}

function columnIndex(header: string[], name: string): number {
  return header.indexOf(name);
}

function isForeignGuest(nationality: string | undefined): boolean {
  if (!nationality?.trim()) return false;
  const n = nationality.trim().toLowerCase();
  return n !== "jp" && n !== "japan" && n !== "日本" && n !== "日本国";
}

function validateRegisterFile(
  absPath: string,
  relPath: string,
  issues: GuestRegisterIssue[]
): number {
  if (!existsSync(absPath)) {
    issues.push({
      level: "warning",
      file: relPath,
      code: "missing_file",
      message: "宿泊者名簿 CSV が存在しません",
    });
    return 0;
  }

  const { header, rows } = parseCsv(readFileSync(absPath, "utf-8"));
  if (header.length === 0) {
    issues.push({
      level: "error",
      file: relPath,
      code: "empty_file",
      message: "宿泊者名簿 CSV にヘッダーがありません",
    });
    return 0;
  }

  for (const col of GUEST_REGISTER_REQUIRED_COLUMNS) {
    if (!header.includes(col)) {
      issues.push({
        level: "error",
        file: relPath,
        code: "missing_column",
        column: col,
        message: `必須列 ${col} がありません`,
      });
    }
  }

  const hasForeignCols = GUEST_REGISTER_FOREIGN_COLUMNS.every((c) => header.includes(c));
  let dataRows = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 2;
    if (row.every((cell) => !cell.trim())) continue;
    dataRows += 1;

    for (const col of GUEST_REGISTER_REQUIRED_COLUMNS) {
      const idx = columnIndex(header, col);
      if (idx < 0) continue;
      const value = row[idx]?.trim() ?? "";
      if (!value) {
        issues.push({
          level: "error",
          file: relPath,
          line,
          column: col,
          code: "empty_required",
          message: `行 ${line}: 必須列 ${col} が空です`,
        });
      }
    }

    const checkInIdx = columnIndex(header, "check_in_date");
    const checkOutIdx = columnIndex(header, "check_out_date");
    const checkIn = checkInIdx >= 0 ? row[checkInIdx]?.trim() : "";
    const checkOut = checkOutIdx >= 0 ? row[checkOutIdx]?.trim() : "";

    if (checkIn && !ISO_DATE.test(checkIn)) {
      issues.push({
        level: "error",
        file: relPath,
        line,
        column: "check_in_date",
        code: "bad_date",
        message: `行 ${line}: check_in_date の形式が不正です`,
      });
    }
    if (checkOut && !ISO_DATE.test(checkOut)) {
      issues.push({
        level: "error",
        file: relPath,
        line,
        column: "check_out_date",
        code: "bad_date",
        message: `行 ${line}: check_out_date の形式が不正です`,
      });
    }
    if (
      checkIn &&
      checkOut &&
      ISO_DATE.test(checkIn) &&
      ISO_DATE.test(checkOut) &&
      checkOut < checkIn
    ) {
      issues.push({
        level: "error",
        file: relPath,
        line,
        code: "date_order",
        message: `行 ${line}: check_out_date が check_in_date より前です`,
      });
    }

    if (hasForeignCols) {
      const natIdx = columnIndex(header, "nationality");
      const passportIdx = columnIndex(header, "passport_or_id_number");
      const nationality = natIdx >= 0 ? row[natIdx]?.trim() : "";
      const passport = passportIdx >= 0 ? row[passportIdx]?.trim() : "";
      if (isForeignGuest(nationality) && !passport) {
        issues.push({
          level: "error",
          file: relPath,
          line,
          column: "passport_or_id_number",
          code: "foreign_passport_required",
          message: `行 ${line}: 外国籍宿泊者は passport_or_id_number が必須です`,
        });
      }
    }

    const stayIdx = columnIndex(header, "stay_id");
    if (stayIdx >= 0) {
      const stayId = row[stayIdx]?.trim();
      if (stayId) {
        const known = loadStays().stays.some((s) => s.id === stayId);
        if (!known) {
          issues.push({
            level: "warning",
            file: relPath,
            line,
            column: "stay_id",
            code: "unknown_stay",
            message: `行 ${line}: stay_id ${stayId} が stays.yaml にありません`,
          });
        }
      }
    }
  }

  return dataRows;
}

function checkRetentionFolders(recordsRoot: string, issues: GuestRegisterIssue[]): void {
  if (!existsSync(recordsRoot)) return;
  const mod = getModuleById("hospitality");
  const docsRoot = (mod?.docs_root ?? "docs/properties/PROP-002/operations/").replace(/\/$/, "");
  const cutoffYear = new Date().getFullYear() - GUEST_REGISTER_RETENTION_YEARS;

  for (const name of readdirSync(recordsRoot, { withFileTypes: true })) {
    if (!name.isDirectory() || !/^\d{4}$/.test(name.name)) continue;
    const year = Number(name.name);
    if (year >= cutoffYear) continue;
    issues.push({
      level: "warning",
      file: `${docsRoot}/records/${name.name}`,
      code: "retention_exceeded",
      message: `records/${name.name} は保存期間 ${GUEST_REGISTER_RETENTION_YEARS} 年を超えています（REG-010）`,
    });
  }
}

function checkMissingStaysInRegister(
  relPath: string,
  rowCount: number,
  header: string[],
  rows: string[][],
  issues: GuestRegisterIssue[]
): void {
  const stayIdx = columnIndex(header, "stay_id");
  const registeredIds = new Set<string>();
  if (stayIdx >= 0) {
    for (const row of rows) {
      const id = row[stayIdx]?.trim();
      if (id) registeredIds.add(id);
    }
  }
  for (const stay of loadStays().stays) {
    if (stay.status === "cancelled" || stay.status === "no_show") continue;
    if (registeredIds.has(stay.id)) continue;
    issues.push({
      level: "warning",
      file: relPath,
      code: "stay_not_in_register",
      message: `stay_id ${stay.id} に対応する名簿行がありません（${rowCount} 行）`,
    });
  }
}

export function validateGuestRegister(opts?: {
  year?: string;
  month?: string;
}): GuestRegisterValidationResult {
  if (!hospitalityModuleEnabled()) {
    return { files: [], issues: [], rowCount: 0 };
  }

  const now = new Date();
  const year = opts?.year ?? String(now.getFullYear());
  const month = opts?.month ?? String(now.getMonth() + 1).padStart(2, "0");
  const relPath = relativeRegisterPath(year, month);
  const absPath = resolveRegisterPath(year, month);
  const issues: GuestRegisterIssue[] = [];
  const files: string[] = [relPath];

  const recordsRoot = docsRecordsRoot();
  if (!recordsRoot) {
    return { files: [], issues: [], rowCount: 0 };
  }

  checkRetentionFolders(recordsRoot, issues);

  if (!absPath) {
    return { files, issues, rowCount: 0 };
  }

  const rowCount = validateRegisterFile(absPath, relPath, issues);

  if (existsSync(absPath)) {
    const { header, rows } = parseCsv(readFileSync(absPath, "utf-8"));
    checkMissingStaysInRegister(relPath, rowCount, header, rows, issues);
  }

  return { files, issues, rowCount };
}

export function formatGuestRegisterReport(result: GuestRegisterValidationResult): string {
  const byCode = new Map<string, number>();
  for (const issue of result.issues) {
    byCode.set(issue.code, (byCode.get(issue.code) ?? 0) + 1);
  }
  const errors = result.issues.filter((i) => i.level === "error").length;
  const warnings = result.issues.filter((i) => i.level === "warning").length;
  const lines = [
    "# 宿泊者名簿 validate",
    "",
    `- ファイル: ${result.files.join(", ") || "—"}`,
    `- データ行: ${result.rowCount}`,
    `- error: ${errors} · warning: ${warnings}`,
    "",
  ];
  if (byCode.size > 0) {
    lines.push("## code 別集計", "", "| code | 件数 |", "|------|-----:|");
    for (const [code, count] of [...byCode.entries()].sort()) {
      lines.push(`| ${code} | ${count} |`);
    }
  } else {
    lines.push("問題なし。");
  }
  return lines.join("\n");
}

export function validateGuestRegisterIntegrity(): GuestRegisterIssue[] {
  if (!hospitalityModuleEnabled()) return [];
  return validateGuestRegister().issues;
}

export type GuestRegisterAppendInput = {
  stayId: string;
  guestName: string;
  address: string;
  occupation: string;
  checkInDate: string;
  checkOutDate: string;
  nationality?: string;
  passportOrIdNumber?: string;
  age?: string;
  gender?: string;
  phone?: string;
  email?: string;
};

function ensureRegisterHeader(absPath: string): string[] {
  if (existsSync(absPath)) {
    const { header } = parseCsv(readFileSync(absPath, "utf-8"));
    if (header.length) return header;
  }
  const header = [...GUEST_REGISTER_ALL_KNOWN_COLUMNS] as string[];
  mkdirSync(dirname(absPath), { recursive: true });
  appendFileSync(absPath, `${header.join(",")}\n`, "utf-8");
  return header;
}

export function appendGuestRegisterRow(
  input: GuestRegisterAppendInput,
  opts?: { year?: string; month?: string }
): { rowsAppended: number; file: string } {
  if (!hospitalityModuleEnabled()) {
    throw new Error("hospitality module is not enabled");
  }
  const stay = loadStays().stays.find((s) => s.id === input.stayId);
  if (!stay) throw new Error(`stay not found: ${input.stayId}`);

  const now = new Date();
  const year = opts?.year ?? input.checkInDate.slice(0, 4) ?? String(now.getFullYear());
  const month = opts?.month ?? input.checkInDate.slice(5, 7) ?? String(now.getMonth() + 1).padStart(2, "0");
  const relPath = relativeRegisterPath(year, month);
  const absPath = resolveRegisterPath(year, month);
  if (!absPath) throw new Error("records path not configured");

  const header = ensureRegisterHeader(absPath);
  const row: Record<string, string> = {
    guest_name: input.guestName,
    address: input.address,
    occupation: input.occupation,
    check_in_date: input.checkInDate,
    check_out_date: input.checkOutDate,
    nationality: input.nationality ?? "JP",
    passport_or_id_number: input.passportOrIdNumber ?? "",
    age: input.age ?? "",
    gender: input.gender ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",
    stay_id: input.stayId,
    booking_channel: stay.channel,
    reservation_id: stay.ota_ref ?? "",
    guest_count: String(stay.party_size),
  };
  const line = header.map((col) => {
    const val = row[col] ?? "";
    return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
  });
  appendFileSync(absPath, `${line.join(",")}\n`, "utf-8");
  validateGuestRegister({ year, month });
  return { rowsAppended: 1, file: relPath };
}
