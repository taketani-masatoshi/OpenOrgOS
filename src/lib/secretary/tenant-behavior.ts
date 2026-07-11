import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTenantDir } from "../tenant.js";

export const SECRETARY_BEHAVIOR_REL = "rules/secretary_behavior.md";

export interface SecretaryDraftTone {
  proposalClosing: string;
  reminderClosing: string;
  confirmClosing: string;
}

const DEFAULT_TONE: SecretaryDraftTone = {
  proposalClosing: "よろしくお願いいたします。",
  reminderClosing: "よろしくお願いいたします。",
  confirmClosing: "当日よろしくお願いいたします。",
};

let cachedTenantId: string | undefined;
let cachedTone: SecretaryDraftTone | undefined;

export function clearSecretaryDraftToneCacheForTests(): void {
  cachedTenantId = undefined;
  cachedTone = undefined;
}

function extractBulletValue(section: string, label: string): string | undefined {
  const pattern = new RegExp(
    `[-*]\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[:：]\\s*(.+)`
  );
  return section.match(pattern)?.[1]?.trim();
}

export function parseSecretaryDraftTone(content: string): SecretaryDraftTone | undefined {
  const section = content.match(/##\s*日程調整下書き[\s\S]*?(?=\n##\s|\n---\s*$|$)/)?.[0];
  if (!section) return undefined;

  const proposalClosing = extractBulletValue(section, "候補提示の結び");
  const reminderClosing = extractBulletValue(section, "リマインドの結び");
  const confirmClosing = extractBulletValue(section, "確定通知の結び");

  if (!proposalClosing && !reminderClosing && !confirmClosing) return undefined;

  return {
    proposalClosing: proposalClosing ?? DEFAULT_TONE.proposalClosing,
    reminderClosing: reminderClosing ?? DEFAULT_TONE.reminderClosing,
    confirmClosing: confirmClosing ?? DEFAULT_TONE.confirmClosing,
  };
}

export function loadSecretaryDraftTone(): SecretaryDraftTone {
  const tenantDir = getTenantDir();
  const tenantId = tenantDir.split("/").pop() ?? tenantDir;
  if (cachedTone && cachedTenantId === tenantId) return cachedTone;

  const path = join(tenantDir, SECRETARY_BEHAVIOR_REL);
  if (!existsSync(path)) {
    cachedTenantId = tenantId;
    cachedTone = DEFAULT_TONE;
    return cachedTone;
  }

  const parsed = parseSecretaryDraftTone(readFileSync(path, "utf-8"));
  cachedTenantId = tenantId;
  cachedTone = parsed ?? DEFAULT_TONE;
  return cachedTone;
}
