import { registerCorrespondenceDomainAdapters } from "../correspondence/domain-adapters.js";
import { createSchedulingCorrespondenceAdapter } from "../scheduling-coordination/correspondence-adapter.js";

let registered = false;

/**
 * Idempotent process-entry registration of domain adapters.
 * Safe to call from CLI, chat/console servers, and test setup.
 */
export function registerDomainAdapters(): void {
  if (registered) return;
  registerCorrespondenceDomainAdapters(createSchedulingCorrespondenceAdapter());
  registered = true;
}

/** Test helper */
export function resetDomainAdaptersRegistrationForTests(): void {
  registered = false;
}
