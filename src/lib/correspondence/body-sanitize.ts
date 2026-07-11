/** 送信本文から下書き用フッター・内部注釈を除去（対外メールに載せない） */
const DRAFT_FOOTER_PATTERNS = [
  /\n*※\s*本メールは送信前の下書きです[^\n]*\n?/g,
  /\n*※\s*送信には代表者の承認が必要です[^\n]*\n?/g,
];

export function sanitizeOutboundEmailBody(body: string): string {
  let out = body;
  for (const pat of DRAFT_FOOTER_PATTERNS) {
    out = out.replace(pat, "\n");
  }
  return out.trimEnd() + "\n";
}
