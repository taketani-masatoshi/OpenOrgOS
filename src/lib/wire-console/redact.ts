import { sanitizeForWireConsoleOutput } from "../sanitize-output.js";

export function redactWireConsoleValue<T>(value: T): T {
  const json = JSON.stringify(value);
  const redacted = sanitizeForWireConsoleOutput(json);
  return JSON.parse(redacted) as T;
}
