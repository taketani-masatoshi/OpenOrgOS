import { existsSync, readFileSync } from "node:fs";
import { loadBankAccounts } from "./classification.js";
import { listOperationsModules, resolveModuleSecretsPath } from "./ops-config.js";

/** L2 相当のパターン — tracked MD 出力前に redact */
const STATIC_PATTERNS: RegExp[] = [
  /\b\d{7}\b/g, // 普通預金口座（7桁）
  /\b\d{3}-\d{4}\b/g, // 携帯 090-1234-5678
  /\b0\d{1,4}-\d{1,4}-\d{4}\b/g, // 固定電話
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // email — 要約では STK/id に置換
  /wifi_password:\s*[^\n]+/gi,
  /smart_lock_code:\s*[^\n]+/gi,
  /account_number:\s*[^\n]+/gi,
  /REPLACE_ME[^\n]*/g,
];

const REDACT = "[REDACTED-L2]";

export function collectDynamicSecrets(): string[] {
  const secrets: string[] = [];
  const banks = loadBankAccounts();
  if (banks) {
    for (const a of banks.accounts) {
      if (a.account_number && a.account_number !== "REPLACE_ME") {
        secrets.push(a.account_number);
      }
      if (a.branch_code && a.branch_code !== "REPLACE_ME") {
        secrets.push(a.branch_code);
      }
    }
  }
  for (const mod of listOperationsModules()) {
    if (!mod.operationsSecrets) continue;
    const secretsPath = resolveModuleSecretsPath(mod.moduleId);
    if (!secretsPath || !existsSync(secretsPath)) continue;
    try {
      const raw = readFileSync(secretsPath, "utf-8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*\w+:\s*"(.+)"\s*$/);
        if (m && m[1] !== "REPLACE_ME" && !m[1].startsWith("TBD")) {
          secrets.push(m[1]);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return secrets;
}

export function sanitizeForTrackedOutput(content: string): string {
  let out = content;
  for (const re of STATIC_PATTERNS) {
    out = out.replace(re, REDACT);
  }
  for (const secret of collectDynamicSecrets()) {
    if (secret.length >= 4) {
      out = out.split(secret).join(REDACT);
    }
  }
  return out;
}

export function assertSafeForTrackedOutput(content: string): { ok: boolean; hits: string[] } {
  const sanitized = sanitizeForTrackedOutput(content);
  const hits: string[] = [];
  if (sanitized.includes(REDACT)) {
    hits.push("L2 パターンまたは登録済み秘密値を検出");
  }
  return { ok: hits.length === 0, hits };
}
