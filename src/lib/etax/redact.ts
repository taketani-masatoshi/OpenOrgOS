import type { EtaxError } from "../../../schemas/etax/errors.js";
import { etaxError } from "../../../schemas/etax/errors.js";

const SECRET_KEY_PATTERN =
  /(pin|password|passwd|passphrase|secret|private[_-]?key|client[_-]?secret|credential)/i;
const SECRET_VALUE_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

const REDACTED = "[REDACTED-ETAX-SECRET]";

export function redactEtaxSecrets(text: string): string {
  return text.replace(SECRET_VALUE_PATTERN, REDACTED);
}

export function redactEtaxRecord<T>(value: T): T {
  return JSON.parse(redactEtaxSecrets(JSON.stringify(value, secretReplacer))) as T;
}

function secretReplacer(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key) && typeof value === "string" && value.length > 0) {
    return REDACTED;
  }
  if (typeof value === "string") return redactEtaxSecrets(value);
  return value;
}

export function assertNoSecretsInText(text: string, context: string): void {
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) {
    throw etaxError({
      code: "ETAX_SECRET_IN_LOG",
      rule: "log-redaction",
      message: `${context} would leak a private key block`,
    });
  }
}

export function formatEtaxError(error: EtaxError): string {
  return JSON.stringify(redactEtaxRecord(error));
}
