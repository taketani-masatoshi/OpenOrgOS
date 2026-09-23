/**
 * Scheduling lifecycle façade — company events, outbound draft creation,
 * post-send transitions, and delegated proposal/confirm send.
 * Prefer importing the focused modules when adding new callers.
 */
export {
  ensureSchedulingCorrespondenceDrafts,
  resolveSchedulingCaseContacts,
  resolveSchedulingParticipantContact,
} from "./correspondence-drafts.js";

export {
  recordSchedulingLifecycleEvent,
  type SchedulingLifecycleStage,
} from "./lifecycle-events.js";

export {
  handleSchedulingCorrespondenceSent,
  reconcileSchedulingCorrespondence,
} from "./correspondence-sent.js";

export {
  maybeAutoSendAuthorizedProposals,
  sendSchedulingConfirmationsAuthorizedByCeo,
  sendSchedulingProposalsUnderStoredAuthority,
} from "./delegated-send.js";
