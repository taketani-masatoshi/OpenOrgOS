/** Redact secret-like strings from CLI / log output. */
export function redactSecrets(text: string): string {
  let out = text.replace(
    /(ORGOS_(?:SMTP|IMAP|WIRE_SMTP|WIRE_IMAP|MAIL|OPERATOR)_(?:PASSWORD|KEY|SECRET|TOKEN))=(\S+)/gi,
    "$1=***"
  );
  out = out.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***");
  out = out.replace(/(?<![A-Z0-9_])(password|pass|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi, (m) =>
    m.replace(/\S+$/, "***")
  );
  return out;
}

export function redactEnvRecord(
  env: Record<string, string | undefined>
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    if (/password|secret|token|key/i.test(key)) out[key] = "***";
    else out[key] = value;
  }
  return out;
}
