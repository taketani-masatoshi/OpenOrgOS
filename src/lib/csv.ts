/** Minimal RFC4180-style CSV parser (quoted fields, embedded commas). */

export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    return { header: [], rows: [] };
  }
  const [header, ...rows] = records;
  return { header, rows };
}

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }

    if (ch === "\r") {
      i += text[i + 1] === "\n" ? 2 : 1;
      row.push(field);
      if (row.some((cell) => cell.length > 0)) {
        records.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    if (ch === "\n") {
      i += 1;
      row.push(field);
      if (row.some((cell) => cell.length > 0)) {
        records.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += ch;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.length > 0)) {
      records.push(row);
    }
  }

  return records;
}
