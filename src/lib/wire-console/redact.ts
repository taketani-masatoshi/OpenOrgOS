import { sanitizeForTrackedOutput } from "../sanitize-output.js";

export function redactWireConsoleValue<T>(value: T): T {
  const json = JSON.stringify(value);
  const redacted = sanitizeForTrackedOutput(json);
  return JSON.parse(redacted) as T;
}
