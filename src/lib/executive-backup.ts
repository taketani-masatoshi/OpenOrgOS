import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getExecutiveDir, SCRATCH_DIR } from "./utils.js";

export const EXECUTIVE_BACKUP_STAMP = join(SCRATCH_DIR, "executive-backup-last.txt");

export function executiveBackupStampAgeDays(): number | null {
  if (!existsSync(EXECUTIVE_BACKUP_STAMP)) return null;
  const last = readFileSync(EXECUTIVE_BACKUP_STAMP, "utf-8").trim().slice(0, 10);
  const lastMs = Date.parse(last + "T12:00:00");
  if (Number.isNaN(lastMs)) return null;
  return Math.floor((Date.now() - lastMs) / 86_400_000);
}

export function hasExecutiveLocalData(): boolean {
  return ["calendar.yaml", "tasks.yaml"].some((name) => existsSync(join(getExecutiveDir(), name)));
}

export function checkExecutiveBackupForWeekly(): { ok: boolean; message: string } {
  if (!hasExecutiveLocalData()) {
    return { ok: true, message: "executive YAML 未作成 — backup stamp スキップ" };
  }
  const age = executiveBackupStampAgeDays();
  if (age === null) {
    return {
      ok: false,
      message:
        "executive バックアップ未記録 — echo $(date +%Y-%m-%d) > scratch/executive-backup-last.txt",
    };
  }
  if (age > 7) {
    return {
      ok: false,
      message: `executive バックアップ ${age} 日前 — 7 日超（週次 SSD 実施）`,
    };
  }
  return { ok: true, message: `executive バックアップ OK（${age} 日前）` };
}
