import type { EtaxError } from "../../../schemas/etax/errors.js";
import { etaxError } from "../../../schemas/etax/errors.js";
import { redactFilingRecord, redactFilingSecrets } from "../efiling/redact.js";

export function redactEtaxSecrets(text: string): string {
  return redactFilingSecrets(text).replaceAll("[REDACTED-FILING-SECRET]", "[REDACTED-ETAX-SECRET]");
}

export function redactEtaxRecord<T>(value: T): T {
  return JSON.parse(redactEtaxSecrets(JSON.stringify(redactFilingRecord(value)))) as T;
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
