/** `"Name" <a@b.example>` → `a@b.example` (lowercase). Bare addresses pass through. */
export function extractEmailAddress(fromHeader: string): string {
  const m = fromHeader.match(/<([^>]+)>/);
  return (m?.[1] ?? fromHeader).trim().toLowerCase();
}

export function extractDisplayName(fromHeader: string): string | undefined {
  const m = fromHeader.match(/^"?([^"<]+)"?\s*</);
  if (m?.[1]) return m[1].trim();
  if (!fromHeader.includes("@")) return fromHeader.trim();
  return undefined;
}

export function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}
