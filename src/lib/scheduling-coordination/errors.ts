/**
 * Unified not-found error for scheduling cases.
 * Message: `Scheduling case <id> not found`
 */
export class SchedulingCaseNotFoundError extends Error {
  readonly caseId: string;

  constructor(caseId: string) {
    super(`Scheduling case ${caseId} not found`);
    this.name = "SchedulingCaseNotFoundError";
    this.caseId = caseId;
  }
}
