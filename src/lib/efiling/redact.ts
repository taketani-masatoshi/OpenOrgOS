const SECRET_KEY_PATTERN =
  /(pin|password|passwd|passphrase|secret|private[_-]?key|client[_-]?secret|credential|nozeisha_?id|user_?id)/i;
const SECRET_VALUE_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

export const FILING_REDACTED = "[REDACTED-FILING-SECRET]";

export function redactFilingSecrets(text: string): string {
  return text.replace(SECRET_VALUE_PATTERN, FILING_REDACTED);
}

export function redactFilingRecord<T>(value: T): T {
  return JSON.parse(redactFilingSecrets(JSON.stringify(value, secretReplacer))) as T;
}

function secretReplacer(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key) && typeof value === "string" && value.length > 0) {
    return FILING_REDACTED;
  }
  if (typeof value === "string") return redactFilingSecrets(value);
  return value;
}
