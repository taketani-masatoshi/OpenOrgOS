/**
 * Shared CSV line parser for finance ingest / bank statement import.
 * No external CSV dependency.
 */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

/** Alias used by bank-statement-import-service (preserves untrimmed cells for remapping). */
export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current);
  return result;
}

export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function splitCsvRows(content: string): string[] {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Build header name (lower) → column index. */
export function headerIndexMap(headerCells: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headerCells.forEach((cell, i) => {
    map.set(cell.trim().toLowerCase(), i);
  });
  return map;
}

export function cellAt(
  cells: string[],
  header: Map<string, number>,
  names: string[],
): string {
  for (const name of names) {
    const i = header.get(name.toLowerCase());
    if (i != null && cells[i] != null && cells[i] !== "") {
      return cells[i]!.trim();
    }
  }
  return "";
}

export function parseYenAmount(raw: string): number {
  const cleaned = raw.replace(/[,¥￥\s]/g, "").replace(/円/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`invalid amount: ${raw}`);
  }
  return Math.round(Math.abs(n));
}
