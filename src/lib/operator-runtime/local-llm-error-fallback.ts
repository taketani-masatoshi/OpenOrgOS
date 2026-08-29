/**
 * Local LLM ERROR fallback — SSOT for tier=local workers.
 * ADR 0061 · steward/rules/local-llm-error-fallback.md
 *
 * When required context is missing, local models must output exactly:
 *   ERROR: <reason>
 * (single line, no markdown, no 未確認, no refusal essays)
 */

export const LOCAL_LLM_ERROR_PREFIX = "ERROR:";

const DEFAULT_COERCE_REASON = "必要な情報が不足しています";

const PLACEHOLDER_PATTERNS = [
  /¥XX,XXX/i,
  /¥YY,YYY/i,
  /¥ZZ,ZZZ/i,
  /XX名/,
  /N名/,
  /ここに集計値が入ります/,
];

const REFUSAL_HINTS = [
  "未確認",
  "わかりません",
  "分かりません",
  "確認できません",
  "アクセスできません",
  "お答えできません",
  "cannot answer",
  "I don't have access",
  "I do not have access",
];

export function isLocalLlmErrorFallbackEnabled(): boolean {
  return process.env.ORGOS_LOCAL_LLM_ERROR_FALLBACK !== "0";
}

export function formatLocalLlmErrorFallbackBlock(): string {
  return [
    "",
    "## Local LLM error fallback (mandatory — overrides Grounding rule #5)",
    "",
    "You are on a **local** LLM worker. Do **not** reply with **未確認**, refusal essays, placeholders, or invented numbers.",
    "",
    "When the answer requires facts that are **not** present in this system prompt, tool results, or attachments:",
    "- Output **exactly one line**: `ERROR: <reason>`",
    "- `<reason>` must be specific (Japanese OK). Example: `ERROR: Today context にバーンレートが含まれていない`",
    "- No other text, markdown, bullets, or apologies before or after.",
    "",
    "When you **do** have grounded facts, reply normally (short CEO-facing prose).",
    "",
  ].join("\n");
}

/** Mail JSON path — allow plain ERROR line instead of JSON when context is insufficient. */
export function formatLocalLlmMailErrorFallbackSuffix(): string {
  return [
    "",
    "If required headers/body are missing and you cannot return valid JSON,",
    "output exactly one line `ERROR: <reason>` instead of JSON (no other text).",
    "",
  ].join("\n");
}

export type LocalLlmErrorParse =
  | { isError: true; reason: string }
  | { isError: false };

export function parseLocalLlmErrorReply(text: string): LocalLlmErrorParse {
  const trimmed = text.trim();
  const match = /^ERROR:\s*(.+)$/s.exec(trimmed);
  if (!match) return { isError: false };
  const reason = match[1]!.trim();
  if (!reason) return { isError: false };
  // Reject multi-line (reason must not contain newlines)
  if (reason.includes("\n")) return { isError: false };
  return { isError: true, reason };
}

export function looksLikeLocalLlmViolation(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (parseLocalLlmErrorReply(trimmed).isError) return false;
  if (REFUSAL_HINTS.some((h) => trimmed.includes(h))) return true;
  if (PLACEHOLDER_PATTERNS.some((p) => p.test(trimmed))) return true;
  // Long refusal-style essays without grounded numbers
  if (trimmed.length > 600 && /申し訳|恐れ入り|確認が必要|お手数/.test(trimmed)) {
    return true;
  }
  return false;
}

export function enforceLocalLlmErrorReply(
  text: string,
  opts?: { coerceReason?: string },
): string {
  const trimmed = text.trim();
  const parsed = parseLocalLlmErrorReply(trimmed);
  if (parsed.isError) return `ERROR: ${parsed.reason}`;
  if (!looksLikeLocalLlmViolation(trimmed)) return trimmed;
  const reason = opts?.coerceReason?.trim() || DEFAULT_COERCE_REASON;
  return `ERROR: ${reason}`;
}

export function applyLocalLlmErrorFallbackToSystem(
  system: string,
  tier?: "local" | "cloud",
): string {
  if (!isLocalLlmErrorFallbackEnabled() || tier !== "local") return system;
  return system + formatLocalLlmErrorFallbackBlock();
}

export function isLocalLlmErrorReply(text: string | undefined): boolean {
  if (!text?.trim()) return false;
  return parseLocalLlmErrorReply(text).isError;
}
