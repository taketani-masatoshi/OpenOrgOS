export class FsGuardError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FsGuardError";
    this.code = code;
  }
}
