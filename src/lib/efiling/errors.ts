export class FilingException extends Error {
  readonly code: string;
  readonly blocked: "SPEC_BLOCKED" | "PRODUCTION_DISABLED" | "DUPLICATE_SUBMISSION" | undefined;

  constructor(code: string, message: string, blocked?: FilingException["blocked"]) {
    super(message);
    this.name = "FilingException";
    this.code = code;
    this.blocked = blocked;
  }
}

export function filingError(
  code: string,
  message: string,
  blocked?: FilingException["blocked"],
): FilingException {
  return new FilingException(code, message, blocked);
}
