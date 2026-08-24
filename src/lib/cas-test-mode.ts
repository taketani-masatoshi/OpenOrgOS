/**
 * Vitest-only escape hatch for legacy unit suites that call lib mutators
 * without optimistic-concurrency tokens. Production / CLI / HTTP never set this.
 */

let allowMissingExpectedRevision = false;

export class ExpectedRevisionRequiredError extends Error {
  readonly code = "expected_revision_required" as const;

  constructor(field = "expected_revision") {
    super(`${field} is required`);
    this.name = "ExpectedRevisionRequiredError";
  }
}

/** Enable skipping empty expected_* tokens. No-op outside Vitest. */
export function allowMissingExpectedRevisionForTests(): void {
  if (process.env.VITEST !== "true") return;
  allowMissingExpectedRevision = true;
}

export function resetCasTestModeForTests(): void {
  allowMissingExpectedRevision = false;
}

export function isMissingExpectedRevisionAllowed(): boolean {
  return allowMissingExpectedRevision && process.env.VITEST === "true";
}

/**
 * Shared gate for envelope / claims / outlook asserts.
 * @param field HTTP/CLI body or flag name for the error message
 */
export function requireExpectedRevisionToken(
  expectedRevision: string | undefined,
  field: string,
): void {
  if (expectedRevision != null && expectedRevision !== "") return;
  if (isMissingExpectedRevisionAllowed()) return;
  throw new ExpectedRevisionRequiredError(field);
}
