import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DOCS_DIR, currentDate, writeMarkdownReport } from "./utils.js";
import { getP0Records, getModuleById } from "./ops-config.js";

export interface RecordsCheckResult {
  baseDir: string;
  months: string[];
  files: { path: string; rows: number }[];
  totalRows: number;
}

function defaultRecordsRel(): string | undefined {
  const spec = getP0Records()[0];
  if (!spec) return undefined;
  const mod = getModuleById(spec.module_id);
  if (!mod?.docs_root) return undefined;
  const root = mod.docs_root.replace(/^docs\//, "").replace(/\/$/, "");
  return `${root}/records`;
}

export function checkOperationsRecords(propertyRel?: string): RecordsCheckResult {
  const rel = propertyRel ?? defaultRecordsRel();
  if (!rel) {
    return { baseDir: "", months: [], files: [], totalRows: 0 };
  }
  const baseDir = join(DOCS_DIR, rel);
  const files: { path: string; rows: number }[] = [];
  let totalRows = 0;
  const months = new Set<string>();

  if (!existsSync(baseDir)) {
    return { baseDir, months: [], files, totalRows: 0 };
  }

  const walk = (dir: string, relPath: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (name.name.startsWith(".") || name.name.endsWith(".md")) continue;
      const full = join(dir, name.name);
      const childRel = relPath ? `${relPath}/${name.name}` : name.name;
      if (name.isDirectory()) {
        if (/^\d{2}$/.test(name.name)) {
          months.add(name.name);
        }
        walk(full, childRel);
      } else if (name.name.endsWith(".csv")) {
        const content = readFileSync(full, "utf-8");
        const rows = Math.max(0, content.trim().split("\n").length - 1);
        files.push({ path: childRel, rows });
        totalRows += rows;
      }
    }
  };

  walk(baseDir, "");
  return {
    baseDir,
    months: [...months].sort(),
    files,
    totalRows,
  };
}

export function formatRecordsCheck(r: RecordsCheckResult): string {
  const lines = [
    "# operations/records チェック",
    "",
    `**パス:** \`${r.baseDir}\``,
    `**データ行合計:** ${r.totalRows}`,
    "",
  ];
  if (r.files.length === 0) {
    lines.push("（CSV なし — テンプレから記録開始）");
  } else {
    lines.push("| ファイル | データ行 |");
    lines.push("|---------|--------:|");
    for (const f of r.files) {
      lines.push(`| ${f.path} | ${f.rows} |`);
    }
  }
  return lines.join("\n");
}
