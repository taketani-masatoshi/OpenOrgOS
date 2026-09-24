/**
 * Shared draft body line helpers (no domain I/O).
 */

export function sanitizeSchedulingDraftBody(body: string): string {
  return body
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (/^送信元\s*[:：]/.test(t)) return false;
      if (/送信元\s*[:：]\s*\S+@\S+/.test(t)) return false;
      if (/\(送信元:/.test(t) || /（送信元:/.test(t)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 意図した空行を保持して結合する（`.filter(Boolean)` は空文字を落とすため使わない）。
 * `undefined` / `false` のみ省略。
 */
export function joinSchedulingDraftLines(
  lines: Array<string | false | undefined | null>
): string {
  return lines.filter((line): line is string => typeof line === "string").join("\n");
}
