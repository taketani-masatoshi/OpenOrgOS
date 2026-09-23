import { readFileSync } from "node:fs";
import { simpleParser } from "mailparser";

const TEXT_PREVIEW_CHARS = 500;

export interface ParsedMailHeaders {
  from: string;
  subject: string;
  messageId?: string;
  receivedAt: string;
  textPreview: string;
}

export async function parseEmlHeaders(emlPath: string): Promise<ParsedMailHeaders> {
  const raw = readFileSync(emlPath, "utf-8");
  const parsed = await simpleParser(raw);
  const from = parsed.from?.text ?? "unknown";
  const subject = parsed.subject ?? "(no subject)";
  const text = (parsed.text ?? "").slice(0, TEXT_PREVIEW_CHARS);
  return {
    from,
    subject,
    messageId: parsed.messageId,
    receivedAt: parsed.date?.toISOString() ?? new Date().toISOString(),
    textPreview: text,
  };
}
