export function extractEmailDomain(email: string): string | undefined {
  const at = email.lastIndexOf("@");
  if (at < 0) return undefined;
  return email.slice(at + 1).toLowerCase();
}

export function extractMessageIdsFromHeaders(raw: string): {
  messageId?: string;
  inReplyTo?: string;
  references: string[];
} {
  const references: string[] = [];
  let messageId: string | undefined;
  let inReplyTo: string | undefined;

  for (const line of raw.split(/\r?\n/)) {
    const mid = line.match(/^Message-ID:\s*(.+)$/i);
    if (mid) messageId = mid[1]!.trim();
    const irt = line.match(/^In-Reply-To:\s*(.+)$/i);
    if (irt) inReplyTo = irt[1]!.trim();
    const ref = line.match(/^References:\s*(.+)$/i);
    if (ref) {
      const parts = ref[1]!.match(/<[^>]+>/g) ?? [];
      references.push(...parts.map((p) => p.trim()));
    }
  }

  return { messageId, inReplyTo, references };
}

export function buildThreadIdsFromHeaders(raw: string): string[] {
  const { messageId, inReplyTo, references } = extractMessageIdsFromHeaders(raw);
  const ids = new Set<string>();
  if (messageId) ids.add(messageId);
  if (inReplyTo) ids.add(inReplyTo);
  for (const r of references) ids.add(r);
  return [...ids];
}
