/**
 * Flatten Markdown into a short OS-notification body (no table markup / symbols).
 */
export function formatNotificationPreview(raw: string, maxLen = 88): string {
  const lines = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, "\n")
    .split("\n")
    .map((line) => cleanMarkdownLine(line))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !isNoiseLine(line));

  if (lines.length === 0) return "";

  const title = lines[0]!;
  const highlight =
    lines.slice(1).find((line) => /合計|残高|現預金|￥|¥|円|税|ランウェイ|burn|Burn|売上|損益/i.test(line)) ??
    lines[1];

  let s =
    highlight && highlight !== title
      ? `${title} · ${highlight.replace(/^合計[:：]\s*/u, "合計 ")}`
      : title;

  s = s.replace(/\s+/g, " ").trim();
  if (s.length <= maxLen) return s;

  const cut = s.slice(0, maxLen - 1);
  const breakAt = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("、"), cut.lastIndexOf("·"));
  const base = breakAt > maxLen * 0.45 ? cut.slice(0, breakAt) : cut;
  return `${base.trimEnd()}…`;
}

function cleanMarkdownLine(line: string): string {
  let s = line.trim();
  if (/^\|?[\s|:*-]+\|?$/.test(s)) return "";

  if (s.includes("|")) {
    s = s
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean)
      .join(" / ");
  }

  return s
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s?/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/[*_~`#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNoiseLine(line: string): boolean {
  if (/^[-*_]{3,}$/.test(line)) return true;
  if (/^Path:/i.test(line)) return true;
  if (/^currency:/i.test(line)) return true;
  if (/^status:/i.test(line)) return true;
  if (/^as[_ ]?of:/i.test(line)) return true;
  if (/^bank_account_id\b/i.test(line)) return true;
  if (/^npm run orgos/i.test(line)) return true;
  // Table header row like "bank_account_id / 残高"
  if (/^[A-Za-z0-9_]+(?:\s*\/\s*[^\s/]+){1,3}$/.test(line) && /_/.test(line)) return true;
  return false;
}
